import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, Channel, ChannelModel, ConsumeMessage } from 'amqplib';
import { SagaStep2BlockDossierUseCase } from '../../../../application/use-cases/saga-step2-block-dossier.use-case';
import { SagaStep2CompensateDossierUseCase } from '../../../../application/use-cases/saga-step2-compensate-dossier.use-case';

@Injectable()
export class SagaCommandConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SagaCommandConsumer.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(
    private readonly blockDossier: SagaStep2BlockDossierUseCase,
    private readonly compensateDossier: SagaStep2CompensateDossierUseCase,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const connection = await connect(process.env.RABBITMQ_URL || 'amqp://localhost');
      this.connection = connection;
      const channel = await connection.createChannel();
      this.channel = channel;
      const exchange = process.env.RABBITMQ_EXCHANGE || 'recruitment.events';
      const queue = process.env.RABBITMQ_SAGA_QUEUE || 'ingesta.saga.commands';
      await channel.assertExchange(exchange, 'topic', { durable: true });
      await channel.assertQueue(queue, { durable: true });
      await channel.bindQueue(queue, exchange, queue);
      await channel.prefetch(1);
      await channel.consume(queue, (message) => {
        if (message) void this.handleMessage(message);
      });
      this.logger.log(`Consumidor SAGA activo en ${queue}`);
    } catch (error) {
      this.logger.error(`No se pudo iniciar consumidor SAGA: ${this.message(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handleMessage(message: ConsumeMessage): Promise<void> {
    try {
      const command = JSON.parse(message.content.toString()) as Record<string, any>;
      const type = command['type'] || command['eventType'] || message.fields.routingKey;
      const payload = command['payload'] || command;
      if (['SagaStep2BlockDossier', 'saga.step2.block-dossier'].includes(type)) {
        await this.blockDossier.execute({
          sagaId: payload['sagaId'], candidateId: payload['candidateId'],
          selectedApplicationId: payload['selectedApplicationId'], selectedVacancyId: payload['selectedVacancyId'],
          reason: payload['reason'],
        });
      } else if (['SagaStep2CompensateDossier', 'saga.step2.compensate-dossier', 'saga.step2.compensate'].includes(type)) {
        await this.compensateDossier.execute({
          sagaId: payload['sagaId'], candidateId: payload['candidateId'],
          restoreApplicationIds: payload['restoreApplicationIds'], reason: payload['reason'],
        });
      } else {
        throw new Error(`Comando SAGA no soportado: ${String(type)}`);
      }
      this.channel?.ack(message);
    } catch (error) {
      this.logger.error(`Comando SAGA rechazado: ${this.message(error)}`);
      this.channel?.nack(message, false, false);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
