import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { UnitOfWorkPort } from '../../../../application/ports/out/unit-of-work.port';
import { MongoSessionContext } from './mongo-session-context';

@Injectable()
export class MongoUnitOfWork implements UnitOfWorkPort {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly sessions: MongoSessionContext,
  ) {}

  async execute<T>(work: () => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(() => this.sessions.run(session, work)) as T;
    } finally {
      await session.endSession();
    }
  }
}
