import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;

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

  Future<http.Response> ingest(CandidateCapture capture) {
    final uri = Uri.parse('$_baseUrl/api/v1/ingestion/cvs');
    return _client.post(
      uri,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        // The gateway/backend currently reads Idempotency-Key. Sending both
        // keeps the mobile contract explicit and remains backwards compatible.
        'X-Idempotency-Key': capture.idempotencyKey,
        'Idempotency-Key': capture.idempotencyKey,
      },
      body: jsonEncode(capture.toRequestBody()),
    );
  }

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
