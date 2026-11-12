import 'dart:async';

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
  final name = TextEditingController();
  final vacancy = TextEditingController();
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
  double interview = 50;
  String status = 'Listo para trabajar sin conexión';
  String? fcmToken;
  bool syncing = false;
  String get devicePlatform => defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  LocalCandidateAssessment get liveAssessment => localAgent.assess(
        name: name.text,
        imagePath: image,
        documentPath: selectedDocument?.path,
        cvScore: cvScore,
        interviewScore: interview,
      );

  @override
  void initState() {
    super.initState();
    inference.initialize();
    connectivity = Connectivity();
    apiClient = IngestionApiClient(
      baseUrl: const String.fromEnvironment(
        'GATEWAY_URL',
        defaultValue: 'http://10.0.2.2:8080',
      ),
    );
    _loadFcmToken();
    sync = SyncManager(
      apiClient: apiClient,
      database: LocalDatabase.instance,
      connectivity: connectivity,
    );
    connectivitySubscription =
        connectivity.onConnectivityChanged.listen((results) {
      if (!results.contains(ConnectivityResult.none)) unawaited(synchronize());
    });
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
      imageQuality: 80,
    );
    if (photo == null) return;

    final score = await inference.classify(photo.path);
    setState(() {
      image = photo.path;
      selectedDocument = null;
      cvScore = score;
      status = 'Análisis TFLite local: ${(score * 100).round()}% CV';
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
        setState(() =>
            status = 'No se pudo acceder a la ruta del archivo seleccionado.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setState(() => status = 'El archivo supera el limite de 10 MB.');
        return;
      }

      setState(() {
        image = null;
        cvScore = 0;
        selectedDocument = file;
        status = 'Archivo listo para guardar: ${file.name}';
      });
    } catch (error) {
      setState(() => status = 'No se pudo seleccionar el archivo: $error');
    }
  }

  Future<void> save() async {
    if ((image == null && selectedDocument == null) ||
        name.text.trim().isEmpty) {
      setState(() =>
          status = 'Indica el nombre y adjunta un CV o toma una fotografia.');
      return;
    }

    final uuid = const Uuid();
    final document = selectedDocument;
    final extension = (document?.extension ?? '').toLowerCase();
    final contentType = switch (extension) {
      'pdf' => 'application/pdf',
      'docx' =>
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
    } catch (error) {
      setState(
          () => status = 'No se pudo guardar el archivo localmente: $error');
      return;
    }
    setState(() {
      image = null;
      selectedDocument = null;
      status = 'Guardado en SQLite. Se sincronizará al recuperar conexión.';
    });
    try {
      final connectivityResults = await connectivity.checkConnectivity();
      if (mounted && !connectivityResults.contains(ConnectivityResult.none)) {
        await synchronize();
      }
    } catch (_) {
      // Keep the SQLite queue when network state cannot be determined.
    }
  }

  Future<void> synchronize() async {
    if (syncing) return;
    syncing = true;
    try {
      final result = await sync.syncPending();
      if (mounted) {
        setState(() {
          status = result.failures.isEmpty
              ? '${result.synchronized} registros sincronizados sin duplicados'
              : '${result.synchronized} sincronizados; '
                  '${result.failures.length} quedan pendientes';
        });
      }
    } catch (error) {
      if (mounted) setState(() => status = 'No se pudo sincronizar: $error');
    } finally {
      syncing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Feria de talento'),
        actions: [
          IconButton(
            onPressed: synchronize,
            icon: const Icon(Icons.sync),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Captura offline',
            style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
          ),
          const Text(
            'Fotografía, califica y continúa aunque no exista conexión.',
          ),
          const SizedBox(height: 20),
          TextField(
            controller: name,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'Nombre del candidato',
            ),
          ),
          TextField(
            controller: vacancy,
            decoration: const InputDecoration(labelText: 'Vacante UUID'),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: capture,
            icon: const Icon(Icons.camera_alt),
            label: const Text('Fotografiar CV impreso'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: chooseDocument,
            icon: const Icon(Icons.attach_file),
            label: const Text('Seleccionar CV PDF o Word'),
          ),
          if (selectedDocument != null)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.description_outlined),
              title: Text(selectedDocument!.name,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              subtitle: Text(
                  '${(selectedDocument!.size / (1024 * 1024)).toStringAsFixed(2)} MB'),
              trailing: IconButton(
                tooltip: 'Quitar archivo',
                onPressed: () => setState(() => selectedDocument = null),
                icon: const Icon(Icons.close),
              ),
            ),
          if (image != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text('CV local ${(cvScore * 100).toStringAsFixed(0)}%'),
            ),
          Text('Calificación entrevista: ${interview.round()}'),
          Slider(
            value: interview,
            min: 0,
            max: 100,
            onChanged: (value) => setState(() => interview = value),
          ),
          Card(
            color: liveAssessment.status == FieldCandidateStatus.suitable
                ? Colors.green.shade50
                : Colors.orange.shade50,
            child: ListTile(
              leading: Icon(liveAssessment.status == FieldCandidateStatus.suitable
                  ? Icons.check_circle_outline
                  : Icons.rule_folder_outlined),
              title: Text('Pre-evaluación local: ${liveAssessment.label}'),
              subtitle: Text(liveAssessment.reasons.join(' ')),
            ),
          ),
          FilledButton(
            onPressed: save,
            child: const Text('Guardar localmente'),
          ),
          OutlinedButton(
            onPressed: synchronize,
            child: const Text('Sincronizar pendientes'),
          ),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(status),
                  if (fcmToken != null) ...[
                    const SizedBox(height: 8),
                    const Text('Notificaciones push activas'),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
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
