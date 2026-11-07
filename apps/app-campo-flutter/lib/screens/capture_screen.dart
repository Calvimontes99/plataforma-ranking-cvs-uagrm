import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../models/candidate_capture.dart';
import '../services/cv_inference_service.dart';
import '../services/local_database.dart';
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
  late final IngestionApiClient apiClient;
  late final SyncManager sync;

  String? image;
  double cvScore = 0;
  double interview = 50;
  String status = 'Listo para trabajar sin conexión';

  @override
  void initState() {
    super.initState();
    inference.initialize();
    apiClient = IngestionApiClient(
      baseUrl: const String.fromEnvironment(
        'GATEWAY_URL',
        defaultValue: 'http://10.0.2.2:8080',
      ),
    );
    sync = SyncManager(
      apiClient: apiClient,
      database: LocalDatabase.instance,
    );
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
      cvScore = score;
      status = 'Análisis TFLite local: ${(score * 100).round()}% CV';
    });
  }

  Future<void> save() async {
    if (image == null || name.text.trim().isEmpty) return;

    final uuid = const Uuid();
    await LocalDatabase.instance.save(
      CandidateCapture(
        id: uuid.v4(),
        idempotencyKey: uuid.v4(),
        name: name.text.trim(),
        vacancyId: vacancy.text.trim(),
        imagePath: image!,
        interviewScore: interview,
        localCvScore: cvScore,
        createdAt: DateTime.now(),
      ),
    );
    setState(() {
      status = 'Guardado en SQLite. Se sincronizará al recuperar conexión.';
    });
  }

  Future<void> synchronize() async {
    final result = await sync.syncPending();
    setState(() {
      status = result.failures.isEmpty
          ? '${result.synchronized} registros sincronizados sin duplicados'
          : '${result.synchronized} sincronizados; '
              '${result.failures.length} quedan pendientes';
    });
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
              child: Text(status),
            ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    name.dispose();
    vacancy.dispose();
    inference.dispose();
    apiClient.close();
    super.dispose();
  }
}
