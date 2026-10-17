export class OutboxEvent {
  constructor(
    readonly id: string,
    readonly eventType: string,
    readonly aggregateId: string,
    readonly payload: Record<string, unknown>,
    readonly createdAt: Date,
    readonly publishedAt?: Date,
    readonly attempts = 0,
  ) {}
}
