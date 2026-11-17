import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';
import { NotificationsService, PlatformEvent } from '../http/notifications.service';

@Injectable()
export class NotificationEventConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationEventConsumer.name);
  private connection?: ChannelModel;
  private channel?: Channel;
  private retryTimer?: NodeJS.Timeout;
  private connecting = false;

  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit(): void {
    this.retryTimer = setInterval(() => {
      if (!this.channel && !this.connecting) void this.connectBroker();
    }, 5000);
    this.retryTimer.unref();
    void this.connectBroker();
  }

  private async connectBroker(): Promise<void> {
    if (this.connecting || this.channel) return;
    this.connecting = true;
    try {
      this.connection = await connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      this.channel = await this.connection.createChannel();
      const exchange = process.env.RABBITMQ_EXCHANGE || 'recruitment.events';
      const queue = process.env.NOTIFICATIONS_QUEUE || 'notifications.events';
      await this.channel.assertExchange(exchange, 'topic', { durable: true });
      await this.channel.assertQueue(queue, { durable: true });
      await Promise.all(['vacancy.*', 'ranking.*', 'candidate.*', 'saga.vacancy.#', 'cv.ingested'].map(key => this.channel!.bindQueue(queue, exchange, key)));
      await this.channel.prefetch(20);
      await this.channel.consume(queue, message => void this.handle(message), { noAck: false });
      this.connection.on('error', error => this.logger.error(`RabbitMQ notifications error: ${error.message}`));
      this.connection.on('close', () => { this.channel = undefined; this.connection = undefined; });
      this.logger.log(`Suscrito a eventos ${exchange} en ${queue}`);
    } catch (error) {
      this.logger.error(`No se pudo iniciar el consumidor de notificaciones: ${this.message(error)}`);
      this.channel = undefined;
      this.connection = undefined;
    } finally {
      this.connecting = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.retryTimer) clearInterval(this.retryTimer);
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handle(message: ConsumeMessage | null): Promise<void> {
    if (!message || !this.channel) return;
    try {
      const envelope = JSON.parse(message.content.toString()) as Record<string, unknown>;
      const payload = (envelope.payload && typeof envelope.payload === 'object'
        ? envelope.payload : envelope) as Record<string, unknown>;
      const event: PlatformEvent = {
        type: String(envelope.eventType || message.properties.headers?.eventType || message.fields.routingKey),
        aggregateId: String(envelope.aggregateId || payload.vacancyId || payload.candidateId || payload.resumeId || ''),
        occurredAt: String(envelope.occurredAt || new Date().toISOString()),
        payload: {
          ...(payload.vacancyId ? { vacancyId: String(payload.vacancyId) } : {}),
          ...(payload.candidateId ? { candidateId: String(payload.candidateId) } : {}),
        },
      };
      await this.notifications.publish(event);
      this.channel.ack(message);
    } catch (error) {
      this.logger.error(`Evento de notificación inválido: ${this.message(error)}`);
      this.channel.nack(message, false, false);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
