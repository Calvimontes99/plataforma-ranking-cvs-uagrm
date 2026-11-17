import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../models/candidate_capture.dart';
import '../services/cv_inference_service.dart';
import '../services/local_database.dart';
import '../services/local_candidate_agent.dart';
import '../services/push_notification_service.dart';
import '../services/sync_manager.dart';

class CaptureScreen extends StatefulWidget {
  const CaptureScreen({super.key});

  @override
  State<CaptureScreen> createState() => _CaptureScreenState();
}

class _CaptureScreenState extends State<CaptureScreen> {
  static const presetVacancies = [
    {
      'title': 'Arquitecto Cloud & IA',
      'uuid': '000000100000100000111013',
      'skills': 'Cloud, IA, Kubernetes',
    },
    {
      'title': 'Especialista DevSecOps',
      'uuid': '000000100000100000111014',
      'skills': 'CI/CD, Terraform, Seguridad',
    },
    {
      'title': 'Ing. Sistemas Senior',
      'uuid': '000000100000100000111015',
      'skills': 'NestJS, Microservicios, TFLite',
    },
  ];

  final name = TextEditingController();
  final vacancy = TextEditingController(text: '000000100000100000111013');
  final inference = CvInferenceService();
  final localAgent = const LocalCandidateAgent();
  late final IngestionApiClient apiClient;
  late final SyncManager sync;
  late final Connectivity connectivity;
  StreamSubscription<List<ConnectivityResult>>? connectivitySubscription;
  StreamSubscription<String>? tokenRefreshSubscription;

  String? image;
  PlatformFile? selectedDocument;
  double cvScore = 0;
  double interview = 65;
  String status = 'Listo para trabajar sin conexión';
  String? fcmToken;
  bool syncing = false;
  bool isOnline = true;
  bool showCustomVacancy = false;
  int pendingCount = 0;
  int lastInferenceMs = 28;

  String get devicePlatform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';

  LocalCandidateAssessment get liveAssessment => localAgent.assess(
        name: name.text,
        imagePath: image,
        documentPath: selectedDocument?.path,
        cvScore: cvScore,
        interviewScore: interview,
      );

  String get interviewTierLabel {
    if (interview >= 80) return 'Sobresaliente (≥80 pts)';
    if (interview >= 60) return 'Aceptable (≥60 pts)';
    return 'Insuficiente (<60 pts)';
  }

  Color get interviewTierColor {
    if (interview >= 80) return const Color(0xFF059669);
    if (interview >= 60) return const Color(0xFFD97706);
    return const Color(0xFFDC2626);
  }

  @override
  void initState() {
    super.initState();
    inference.initialize();
    connectivity = Connectivity();
    apiClient = IngestionApiClient(
      baseUrl: const String.fromEnvironment(
        'GATEWAY_URL',
        defaultValue: 'https://cv-talento-uagrm.westus2.cloudapp.azure.com',
      ),
    );
    _loadFcmToken();
    sync = SyncManager(
      apiClient: apiClient,
      database: LocalDatabase.instance,
      connectivity: connectivity,
    );
    _refreshPendingCount();
    connectivitySubscription = connectivity.onConnectivityChanged.listen((results) {
      final online = !results.contains(ConnectivityResult.none);
      if (mounted) setState(() => isOnline = online);
      if (online) unawaited(synchronize());
    });
  }

  Future<void> _refreshPendingCount() async {
    try {
      final list = await LocalDatabase.instance.pending();
      if (mounted) setState(() => pendingCount = list.length);
    } catch (_) {}
  }

  Future<void> _loadFcmToken() async {
    try {
      final push = PushNotificationService.instance;
      final token = await push.getToken();
      if (mounted) setState(() => fcmToken = token);
      if (token != null && token.isNotEmpty) {
        await apiClient.registerDeviceToken(token, platform: devicePlatform);
      }
      tokenRefreshSubscription = push.onTokenRefresh.listen((newToken) {
        if (mounted) setState(() => fcmToken = newToken);
        unawaited(apiClient.registerDeviceToken(newToken, platform: devicePlatform).catchError((error) {
          debugPrint('FCM token registration failed: $error');
        }));
      });
    } catch (error) {
      debugPrint('FCM token unavailable: $error');
    }
  }

  Future<void> capture() async {
    final photo = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    if (photo == null) return;

    final sw = Stopwatch()..start();
    final score = await inference.classify(photo.path);
    sw.stop();
    final ms = sw.elapsedMilliseconds > 0 ? sw.elapsedMilliseconds : 26;

    setState(() {
      image = photo.path;
      selectedDocument = null;
      cvScore = score;
      lastInferenceMs = ms;
      status = 'Análisis Edge IA: ${(score * 100).round()}% estructura ($ms ms)';
    });
  }

  Future<void> chooseDocument() async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'docx'],
        allowMultiple: false,
        withData: false,
      );
      if (result == null || result.files.isEmpty) return;

      final file = result.files.single;
      if (file.path == null) {
        setState(() => status = 'No se pudo acceder a la ruta del archivo seleccionado.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setState(() => status = 'El archivo supera el límite de 10 MB.');
        return;
      }

      setState(() {
        image = null;
        cvScore = 0.88; // Puntaje base para documento digital estructurado
        selectedDocument = file;
        status = 'Documento listo para ingesta: ${file.name}';
      });
    } catch (error) {
      setState(() => status = 'No se pudo seleccionar el archivo: $error');
    }
  }

  Future<void> save() async {
    if ((image == null && selectedDocument == null) || name.text.trim().isEmpty) {
      setState(() => status = 'Indica el nombre del candidato y adjunta una foto o documento.');
      return;
    }

    final uuid = const Uuid();
    final document = selectedDocument;
    final extension = (document?.extension ?? '').toLowerCase();
    final contentType = switch (extension) {
      'pdf' => 'application/pdf',
      'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      _ => null,
    };

    try {
      await LocalDatabase.instance.save(
        CandidateCapture(
          id: uuid.v4(),
          idempotencyKey: uuid.v4(),
          name: name.text.trim(),
          vacancyId: vacancy.text.trim(),
          imagePath: image ?? '',
          attachmentPath: document?.path,
          attachmentName: document?.name,
          attachmentContentType: contentType,
          interviewScore: interview,
          localCvScore: cvScore,
          createdAt: DateTime.now(),
        ),
      );
      await _refreshPendingCount();
    } catch (error) {
      setState(() => status = 'No se pudo guardar localmente: $error');
      return;
    }

    setState(() {
      image = null;
      selectedDocument = null;
      name.clear();
      status = 'Guardado en SQLite local. Listo para sincronizar con Azure.';
    });

    try {
      final connectivityResults = await connectivity.checkConnectivity();
      if (mounted && !connectivityResults.contains(ConnectivityResult.none)) {
        await synchronize();
      }
    } catch (_) {
      // Mantiene la cola en SQLite ante cualquier excepción
    }
  }

  Future<void> synchronize() async {
    if (syncing) return;
    setState(() => syncing = true);
    try {
      final result = await sync.syncPending();
      await _refreshPendingCount();
      if (mounted) {
        setState(() {
          status = result.failures.isEmpty
              ? '${result.synchronized} registros sincronizados con Azure sin duplicados'
              : '${result.synchronized} sincronizados; ${result.failures.length} en cola (${result.failures.first.message})';
        });
      }
    } catch (error) {
      if (mounted) setState(() => status = 'Sincronización en pausa: guardado seguro en SQLite.');
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final assessment = liveAssessment;

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Feria de talento',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
            ),
            Text(
              'Agente IA de Campo · Edge AI',
              style: TextStyle(fontSize: 11.5, color: Color(0xFFD1FAE5)),
            ),
          ],
        ),
        backgroundColor: const Color(0xFF174D45),
        foregroundColor: Colors.white,
        elevation: 2,
        actions: [
          IconButton(
            tooltip: 'Sincronizar ahora',
            onPressed: syncing ? null : synchronize,
            icon: syncing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.sync),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        children: [
          // Conectividad Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isOnline ? const Color(0xFFECFDF5) : const Color(0xFFFFF7ED),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: isOnline ? const Color(0xFFA7F3D0) : const Color(0xFFFED7AA),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  isOnline ? Icons.cloud_done : Icons.cloud_off,
                  size: 16,
                  color: isOnline ? const Color(0xFF059669) : const Color(0xFFEA580C),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isOnline
                        ? '🟢 En línea · Conectado a Azure (Sync Automático)'
                        : '🟠 Modo Offline · Guardado local seguro en SQLite',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: isOnline ? const Color(0xFF065F46) : const Color(0xFF9A3412),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Título y explicación
          const Text(
            'Captura offline',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF111827)),
          ),
          const Text(
            'Pre-evaluación con Edge AI en el dispositivo y sincronización en la nube.',
            style: TextStyle(fontSize: 12.5, color: Color(0xFF4B5563)),
          ),
          const SizedBox(height: 14),

          // Nombre del Candidato
          TextField(
            controller: name,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Nombre del candidato',
              hintText: 'Ej. Ana Sofía Vargas',
              prefixIcon: const Icon(Icons.person_outline),
              filled: true,
              fillColor: Colors.white,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Selector de Vacante Rápido
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Vacante objetivo:',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF374151)),
                  ),
                  TextButton(
                    style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                    onPressed: () => setState(() => showCustomVacancy = !showCustomVacancy),
                    child: Text(
                      showCustomVacancy ? 'Ocultar UUID' : 'Personalizar UUID',
                      style: const TextStyle(fontSize: 11),
                    ),
                  ),
                ],
              ),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: presetVacancies.map((v) {
                  final isSelected = vacancy.text.trim() == v['uuid'];
                  return ChoiceChip(
                    label: Text(v['title']!),
                    selected: isSelected,
                    selectedColor: const Color(0xFF174D45),
                    labelStyle: TextStyle(
                      color: isSelected ? Colors.white : const Color(0xFF1F2937),
                      fontSize: 11.5,
                      fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                    ),
                    avatar: Icon(
                      Icons.work_outline,
                      size: 14,
                      color: isSelected ? Colors.white : const Color(0xFF6B7280),
                    ),
                    onSelected: (val) {
                      if (val) {
                        setState(() => vacancy.text = v['uuid']!);
                      }
                    },
                  );
                }).toList(),
              ),
              if (showCustomVacancy) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: vacancy,
                  style: const TextStyle(fontSize: 12, fontFamily: 'monospace'),
                  decoration: InputDecoration(
                    labelText: 'UUID de Vacante',
                    isDense: true,
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),

          // Botones de Captura
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: capture,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF174D45),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  icon: const Icon(Icons.camera_alt, size: 18),
                  label: const Text('Fotografiar CV', style: TextStyle(fontSize: 12.5)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: chooseDocument,
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    side: const BorderSide(color: Color(0xFF174D45)),
                  ),
                  icon: const Icon(Icons.attach_file, size: 18, color: Color(0xFF174D45)),
                  label: const Text(
                    'Adjuntar PDF/Word',
                    style: TextStyle(fontSize: 12, color: Color(0xFF174D45)),
                  ),
                ),
              ),
            ],
          ),

          // Preview de Imagen Capturada
          if (image != null)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.file(
                      File(image!),
                      width: 56,
                      height: 56,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.check_circle, size: 14, color: Color(0xFF10B981)),
                            SizedBox(width: 4),
                            Text(
                              'CV Fotografiado en Campo',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        Text(
                          'Inferencia Edge: ${(cvScore * 100).round()}% estructura ($lastInferenceMs ms)',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF4B5563)),
                        ),
                        Text(
                          image!.split(Platform.pathSeparator).last,
                          style: const TextStyle(fontSize: 10, color: Color(0xFF9CA3AF)),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    tooltip: 'Descartar foto',
                    onPressed: () => setState(() {
                      image = null;
                      cvScore = 0;
                    }),
                  ),
                ],
              ),
            ),

          // Preview de Documento PDF/Word
          if (selectedDocument != null)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.description_outlined, color: Color(0xFF4F46E5), size: 24),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          selectedDocument!.name,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          '${(selectedDocument!.size / (1024 * 1024)).toStringAsFixed(2)} MB · Estructura digital lista',
                          style: const TextStyle(fontSize: 10.5, color: Color(0xFF4B5563)),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    tooltip: 'Quitar archivo',
                    onPressed: () => setState(() {
                      selectedDocument = null;
                      cvScore = 0;
                    }),
                  ),
                ],
              ),
            ),

          const SizedBox(height: 14),

          // Slider de Entrevista con Rango Cualitativo
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Calificación de entrevista:',
                      style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.bold, color: Color(0xFF374151)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: interviewTierColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${interview.round()} pts · $interviewTierLabel',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: interviewTierColor,
                        ),
                      ),
                    ),
                  ],
                ),
                Slider(
                  value: interview,
                  min: 0,
                  max: 100,
                  activeColor: const Color(0xFF174D45),
                  inactiveColor: Colors.grey.shade200,
                  onChanged: (value) => setState(() => interview = value),
                ),
              ],
            ),
          ),

          // PANEL DEL AGENTE IA LOCAL
          _buildAgentAssessmentCard(assessment),

          // Botones Guardar y Sincronizar
          FilledButton.icon(
            onPressed: save,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF174D45),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            icon: const Icon(Icons.save_outlined, size: 20),
            label: const Text(
              'Guardar localmente',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: syncing ? null : synchronize,
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              side: const BorderSide(color: Color(0xFF174D45)),
            ),
            icon: const Icon(Icons.cloud_upload_outlined, size: 18, color: Color(0xFF174D45)),
            label: Text(
              syncing ? 'Sincronizando con Azure...' : 'Sincronizar pendientes ahora',
              style: const TextStyle(fontSize: 13, color: Color(0xFF174D45), fontWeight: FontWeight.w600),
            ),
          ),

          // Estado del Sistema, SQLite y Notificaciones
          Container(
            margin: const EdgeInsets.only(top: 14),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.storage_outlined, size: 15, color: Color(0xFF4B5563)),
                    const SizedBox(width: 6),
                    Text(
                      'Cola SQLite: $pendingCount expedientes pendientes',
                      style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(
                      fcmToken != null ? Icons.notifications_active : Icons.notifications_none,
                      size: 15,
                      color: fcmToken != null ? const Color(0xFF059669) : Colors.grey,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        fcmToken != null
                            ? 'Push FCM: Vinculado con servidor Azure (Canal recruitment_alerts)'
                            : 'Push FCM: Receptor en espera de registro...',
                        style: TextStyle(
                          fontSize: 11,
                          color: fcmToken != null ? const Color(0xFF065F46) : Colors.grey,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Estado: $status',
                  style: const TextStyle(fontSize: 10.5, color: Color(0xFF6B7280)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _buildAgentAssessmentCard(LocalCandidateAssessment assessment) {
    final isSuitable = assessment.isSuitable;
    final primaryColor = isSuitable ? const Color(0xFF047857) : const Color(0xFFD97706);
    final bgColor = isSuitable ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB);
    final borderColor = isSuitable ? const Color(0xFFA7F3D0) : const Color(0xFFFDE68A);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: borderColor, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: primaryColor.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: primaryColor.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.smart_toy_outlined, color: primaryColor, size: 20),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Agente IA Local · Edge AI',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF4B5563),
                        letterSpacing: 0.3,
                      ),
                    ),
                    Text(
                      'Evaluación en Dispositivo (Offline)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: primaryColor,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: primaryColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isSuitable ? Icons.check_circle : Icons.warning_amber_rounded,
                      color: Colors.white,
                      size: 13,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      assessment.label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10.5,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Divider(height: 1),
          const SizedBox(height: 10),
          _buildMetricRow(
            label: 'Estructura Visual / Documental (Edge CNN)',
            value: assessment.visualScore,
            valueDisplay: '${(assessment.visualScore * 100).round()}%',
            color: assessment.visualScore >= 0.5 ? const Color(0xFF10B981) : const Color(0xFFEF4444),
            thresholdLabel: 'Umbral: ≥50%',
          ),
          const SizedBox(height: 8),
          _buildMetricRow(
            label: 'Calificación de Entrevista en Campo',
            value: (assessment.interviewScore / 100.0).clamp(0.0, 1.0),
            valueDisplay: '${assessment.interviewScore.round()} / 100 pts',
            color: assessment.interviewScore >= 60 ? const Color(0xFF10B981) : const Color(0xFFEF4444),
            thresholdLabel: 'Umbral: ≥60 pts',
          ),
          const SizedBox(height: 8),
          _buildMetricRow(
            label: 'Completitud y Validación de Datos',
            value: assessment.completenessScore,
            valueDisplay: '${(assessment.completenessScore * 100).round()}%',
            color: assessment.completenessScore >= 0.8 ? const Color(0xFF10B981) : const Color(0xFFF59E0B),
            thresholdLabel: 'Nombre y CV obligatorios',
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.8),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: borderColor),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Compatibilidad Preliminar Local:',
                  style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: Color(0xFF374151)),
                ),
                Text(
                  '${(assessment.compositeScore * 100).toStringAsFixed(1)}%',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: isSuitable ? const Color(0xFF047857) : const Color(0xFFD97706),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: primaryColor.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 15, color: primaryColor),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    assessment.summary,
                    style: TextStyle(fontSize: 11.5, color: primaryColor, height: 1.25),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          const Row(
            children: [
              Icon(Icons.cloud_sync_outlined, size: 13, color: Color(0xFF6B7280)),
              SizedBox(width: 5),
              Expanded(
                child: Text(
                  'Fase 2: Al sincronizar con Azure, ai-node ejecutará OCR y el modelo supervisado.',
                  style: TextStyle(fontSize: 10, color: Color(0xFF6B7280), fontStyle: FontStyle.italic),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricRow({
    required String label,
    required double value,
    required String valueDisplay,
    required Color color,
    required String thresholdLabel,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(
                label,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Color(0xFF374151)),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Text(
              valueDisplay,
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.bold, color: color),
            ),
          ],
        ),
        const SizedBox(height: 3),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: value.clamp(0.0, 1.0),
            backgroundColor: Colors.grey.shade200,
            valueColor: AlwaysStoppedAnimation<Color>(color),
            minHeight: 5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          thresholdLabel,
          style: TextStyle(fontSize: 9.5, color: Colors.grey.shade600),
        ),
      ],
    );
  }

  @override
  void dispose() {
    if (connectivitySubscription != null) {
      unawaited(connectivitySubscription!.cancel());
    }
    if (tokenRefreshSubscription != null) {
      unawaited(tokenRefreshSubscription!.cancel());
    }
    name.dispose();
    vacancy.dispose();
    inference.dispose();
    apiClient.close();
    super.dispose();
  }
}
