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
    final existing = _database;
    if (existing != null) return existing;

    final databasePath = join(await getDatabasesPath(), _databaseName);
    final opened = await openDatabase(
      databasePath,
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE $_tableName (
            id TEXT PRIMARY KEY,
            idempotency_key TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            vacancy_id TEXT NOT NULL,
            image_path TEXT NOT NULL,
            interview_score REAL NOT NULL,
            local_cv_score REAL NOT NULL,
            created_at TEXT NOT NULL
          )
        ''');
      },
    );
    _database = opened;
    return opened;
  }

  Future<void> save(CandidateCapture capture) async {
    final db = await database;
    await db.insert(
      _tableName,
      capture.toMap(),
      conflictAlgorithm: ConflictAlgorithm.abort,
    );
  }

  Future<List<CandidateCapture>> pending({int? limit}) async {
    final rows = await (await database).query(
      _tableName,
      orderBy: 'created_at ASC',
      limit: limit,
    );
    return rows
        .map((row) => CandidateCapture.fromMap(Map<String, Object?>.from(row)))
        .toList(growable: false);
  }

  Future<void> delete(String id) async {
    await (await database).delete(
      _tableName,
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}
