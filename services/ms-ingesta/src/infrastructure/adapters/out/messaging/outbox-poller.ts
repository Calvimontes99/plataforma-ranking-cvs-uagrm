import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, ConfirmChannel, ChannelModel } from 'amqplib';
import { OUTBOX_REPOSITORY } from '../../../tokens';
import { OutboxRepositoryPort } from '../../../../application/ports/out/outbox-repository.port';

@Injectable()
export class OutboxPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPoller.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepositoryPort) {}

  onModuleInit(): void {
    const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS || 1000);
    this.timer = setInterval(() => void this.publishPending(), intervalMs);
    this.timer.unref();
    void this.connectBroker();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.channel?.close();
    await this.connection?.close();
  }

  private async connectBroker(): Promise<void> {
    try {
      const connection = await connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      this.connection = connection;
      const channel = await connection.createConfirmChannel();
      this.channel = channel;
      await channel.assertExchange(process.env.RABBITMQ_EXCHANGE || 'recruitment.events', 'topic', { durable: true });
      connection.on('close', () => { this.channel = undefined; this.connection = undefined; });
      connection.on('error', (error) => this.logger.error(`RabbitMQ outbox connection error: ${error.message}`));
      this.logger.log('Outbox conectado a RabbitMQ');
    } catch (error) {
      this.logger.error(`No se pudo conectar outbox a RabbitMQ: ${this.message(error)}`);
    }
  }

  private async publishPending(): Promise<void> {
    if (this.running) return;
    if (!this.channel) {
      if (!this.connection) await this.connectBroker();
      return;
    }
    this.running = true;
    try {
      const events = await this.outbox.findPending(50);
      for (const event of events) {
        try {
          await new Promise<void>((resolvePublish, reject) => {
            this.channel!.publish(
              process.env.RABBITMQ_EXCHANGE || 'recruitment.events',
              event.eventType,
              Buffer.from(JSON.stringify({
                eventId: event.id, eventType: event.eventType, aggregateId: event.aggregateId,
                occurredAt: event.createdAt, payload: event.payload,
              })),
              { persistent: true, contentType: 'application/json', messageId: event.id },
              (error) => error ? reject(error) : resolvePublish(),
            );
          });
          await this.outbox.markPublished(event.id);
        } catch (error) {
          await this.outbox.markFailed(event.id);
          this.logger.error(`No se pudo publicar outbox ${event.id}: ${this.message(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error al procesar outbox: ${this.message(error)}`);
    } finally {
      this.running = false;
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
