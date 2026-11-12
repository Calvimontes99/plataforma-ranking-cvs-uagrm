import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../models/candidate_capture.dart';
import 'local_database.dart';

class IngestionApiClient {
  IngestionApiClient({
    required String baseUrl,
    http.Client? client,
  })  : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
        _client = client ?? http.Client();

  final String _baseUrl;
  final http.Client _client;

  Future<http.Response> ingest(CandidateCapture capture) async {
    final documentPath = capture.attachmentPath;
    final photoPath = capture.imagePath;
    final filePath = documentPath?.isNotEmpty == true ? documentPath : photoPath;
    final hasFile = filePath?.isNotEmpty == true;
    final uri = Uri.parse(
      hasFile
          ? '$_baseUrl/api/v1/ingestion/cvs/upload'
          : '$_baseUrl/api/v1/ingestion/cvs',
    );
    final headers = {
      'Accept': 'application/json',
      'X-Idempotency-Key': capture.idempotencyKey,
      'Idempotency-Key': capture.idempotencyKey,
    };

    if (hasFile) {
      final isDocument = documentPath?.isNotEmpty == true;
      final fileName = isDocument ? capture.attachmentName ?? 'cv' : 'candidate-photo${_extension(photoPath)}';
      final contentType = isDocument
          ? capture.attachmentContentType ?? 'application/octet-stream'
          : _imageContentType(photoPath);
      final request = http.MultipartRequest('POST', uri)
        ..headers.addAll(headers);
      request.fields.addAll({
        'candidateId': capture.id,
        'channel': 'mobile',
        'applicantName': capture.name,
        'localCvScore': capture.localCvScore.toString(),
        'interviewScore': capture.interviewScore.toString(),
        'capturedAt': capture.createdAt.toIso8601String(),
        if (capture.vacancyId.isNotEmpty) 'vacancyId': capture.vacancyId,
      });
      request.files.add(await http.MultipartFile.fromPath(
        'file',
        filePath!,
        filename: fileName,
        contentType: MediaType.parse(contentType),
      ));
      return http.Response.fromStream(await _client.send(request));
    }

    return _client.post(
      uri,
      headers: {...headers, 'Content-Type': 'application/json'},
      body: jsonEncode(capture.toRequestBody()),
    );
  }

  Future<void> registerDeviceToken(String token, {String platform = 'unknown'}) async {
    final uri = Uri.parse('$_baseUrl/api/v1/notifications/register-token');
    final response = await _client.post(
      uri,
      headers: const {'Accept': 'application/json', 'Content-Type': 'application/json'},
      body: jsonEncode({'token': token, 'platform': platform}),
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw http.ClientException('Token registration failed: HTTP ${response.statusCode}', uri);
    }
  }

  String _extension(String? path) {
    if (path == null) return '.jpg';
    final dot = path.lastIndexOf('.');
    return dot < 0 ? '.jpg' : path.substring(dot).toLowerCase();
  }

  String _imageContentType(String? path) => switch (_extension(path)) {
        '.png' => 'image/png',
        '.webp' => 'image/webp',
        _ => 'image/jpeg',
      };

  void close() => _client.close();
}

class SyncFailure {
  const SyncFailure({required this.captureId, required this.message});

  final String captureId;
  final String message;
}

class SyncResult {
  const SyncResult({required this.synchronized, required this.failures});

  final int synchronized;
  final List<SyncFailure> failures;

  int get attempted => synchronized + failures.length;
}

class SyncManager {
  SyncManager({
    required this.apiClient,
    required this.database,
    Connectivity? connectivity,
  }) : _connectivity = connectivity ?? Connectivity();

  final IngestionApiClient apiClient;
  final LocalDatabase database;
  final Connectivity _connectivity;

  Future<SyncResult> syncPending({int batchSize = 50}) async {
    final connectivityResults = await _connectivity.checkConnectivity();
    if (connectivityResults.contains(ConnectivityResult.none)) {
      return const SyncResult(synchronized: 0, failures: []);
    }

    final pending = await database.pending(limit: batchSize);
    var synchronized = 0;
    final failures = <SyncFailure>[];

    for (final capture in pending) {
      try {
        final response = await apiClient.ingest(capture);
        if (response.statusCode == 200 || response.statusCode == 201) {
          await database.delete(capture.id);
          synchronized++;
        } else {
          failures.add(SyncFailure(
            captureId: capture.id,
            message: 'HTTP ${response.statusCode}: ${response.body}',
          ));
        }
      } on Exception catch (error) {
        failures.add(SyncFailure(
          captureId: capture.id,
          message: error.toString(),
        ));
      }
    }

    return SyncResult(synchronized: synchronized, failures: failures);
  }
}
