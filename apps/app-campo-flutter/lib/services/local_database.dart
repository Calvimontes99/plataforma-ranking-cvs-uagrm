import 'dart:io';

import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import '../models/candidate_capture.dart';

class LocalDatabase {
  LocalDatabase._();
  static final LocalDatabase instance = LocalDatabase._();
  static const _databaseName = 'recruitment_field.db';
  static const _tableName = 'captures';
  Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    final databasePath = join(await getDatabasesPath(), _databaseName);
    _database = await openDatabase(
      databasePath,
      version: 3,
      onCreate: (db, version) => db.execute('''
        CREATE TABLE $_tableName (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          vacancy_id TEXT NOT NULL,
          image_path TEXT NOT NULL,
          attachment_path TEXT,
          attachment_name TEXT,
          attachment_content_type TEXT,
          interview_score REAL NOT NULL,
          local_cv_score REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      '''),
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          await db.execute('ALTER TABLE $_tableName ADD COLUMN attachment_path TEXT');
          await db.execute('ALTER TABLE $_tableName ADD COLUMN attachment_name TEXT');
          await db.execute('ALTER TABLE $_tableName ADD COLUMN attachment_content_type TEXT');
        }
      },
    );
    return _database!;
  }

  Future<void> save(CandidateCapture capture) async {
    final db = await database;
    final persisted = await _persistCaptureFiles(capture);
    try {
      await db.insert(_tableName, persisted.toMap(), conflictAlgorithm: ConflictAlgorithm.abort);
    } catch (_) {
      if (persisted.attachmentPath != capture.attachmentPath) await _deleteFileQuietly(persisted.attachmentPath);
      if (persisted.imagePath != capture.imagePath) await _deleteFileQuietly(persisted.imagePath);
      rethrow;
    }
  }

  Future<List<CandidateCapture>> pending({int? limit}) async {
    final rows = await (await database).query(_tableName, orderBy: 'created_at ASC', limit: limit);
    return rows.map((row) => CandidateCapture.fromMap(Map<String, Object?>.from(row))).toList(growable: false);
  }

  Future<void> delete(String id) async {
    final db = await database;
    final rows = await db.query(_tableName, columns: ['attachment_path', 'image_path'], where: 'id = ?', whereArgs: [id]);
    await db.delete(_tableName, where: 'id = ?', whereArgs: [id]);
    if (rows.isNotEmpty) {
      await _deleteFileQuietly(rows.first['attachment_path'] as String?);
      await _deleteFileQuietly(rows.first['image_path'] as String?);
    }
  }

  Future<CandidateCapture> _persistCaptureFiles(CandidateCapture capture) async {
    final directory = Directory(join(await getDatabasesPath(), 'attachments'));
    await directory.create(recursive: true);
    Future<String?> persist(String? sourcePath, String suffix, String? fileName) async {
      if (sourcePath == null || sourcePath.isEmpty) return null;
      final source = File(sourcePath);
      if (!await source.exists()) throw FileSystemException('Selected file is unavailable', sourcePath);
      final fileExtension = extension(fileName ?? sourcePath).toLowerCase();
      final destination = File(join(directory.path, '${capture.id}.$suffix$fileExtension'));
      if (source.absolute.path != destination.absolute.path) await source.copy(destination.path);
      return destination.path;
    }

    final attachmentPath = await persist(capture.attachmentPath, 'document', capture.attachmentName);
    final imagePath = await persist(capture.imagePath.isEmpty ? null : capture.imagePath, 'photo', null);
    return CandidateCapture(
      id: capture.id,
      idempotencyKey: capture.idempotencyKey,
      name: capture.name,
      vacancyId: capture.vacancyId,
      imagePath: imagePath ?? '',
      attachmentPath: attachmentPath,
      attachmentName: capture.attachmentName,
      attachmentContentType: capture.attachmentContentType,
      interviewScore: capture.interviewScore,
      localCvScore: capture.localCvScore,
      createdAt: capture.createdAt,
    );
  }

  Future<void> _deleteFileQuietly(String? path) async {
    if (path == null || path.isEmpty) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } on FileSystemException {
      // A stale file must not prevent removal of a completed queue row.
    }
  }
}
