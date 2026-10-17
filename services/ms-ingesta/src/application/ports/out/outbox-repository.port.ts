import { OutboxEvent } from '../../../domain/entities/outbox-event.entity';

export interface OutboxRepositoryPort {
  add(event: OutboxEvent): Promise<void>;
  findPending(limit: number): Promise<OutboxEvent[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
}
