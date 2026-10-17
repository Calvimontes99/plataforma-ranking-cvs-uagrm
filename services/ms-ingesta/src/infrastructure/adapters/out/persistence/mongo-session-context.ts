import { Injectable } from '@nestjs/common';
import { ClientSession } from 'mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class MongoSessionContext {
  private readonly sessions = new AsyncLocalStorage<ClientSession>();

  current(): ClientSession | undefined {
    return this.sessions.getStore();
  }

  run<T>(session: ClientSession, work: () => Promise<T>): Promise<T> {
    return this.sessions.run(session, work);
  }

  bind<Q extends { session(session: ClientSession | null): Q }>(query: Q): Q {
    const session = this.current();
    if (session) query.session(session);
    return query;
  }
}
