import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { IngestCvUseCase } from './application/use-cases/ingest-cv.use-case';
import { SagaStep2BlockDossierUseCase } from './application/use-cases/saga-step2-block-dossier.use-case';
import { SagaStep2CompensateDossierUseCase } from './application/use-cases/saga-step2-compensate-dossier.use-case';
import { AiNodeGrpcClientPort } from './application/ports/out/ai-node-grpc-client.port';
import { CurriculumRepositoryPort } from './application/ports/out/curriculum-repository.port';
import { PostulacionRepositoryPort } from './application/ports/out/postulacion-repository.port';
import { OutboxRepositoryPort } from './application/ports/out/outbox-repository.port';
import { IdempotencyPort } from './application/ports/out/idempotency.port';
import { UnitOfWorkPort } from './application/ports/out/unit-of-work.port';
import { AI_NODE_CLIENT, CURRICULUM_REPOSITORY, IDEMPOTENCY, OUTBOX_REPOSITORY, POSTULACION_REPOSITORY, UNIT_OF_WORK } from './infrastructure/tokens';
import { IngestionController } from './infrastructure/adapters/in/http/ingestion.controller';
import { McpController } from './infrastructure/adapters/in/http/mcp.controller';
import { HealthController } from './infrastructure/adapters/in/http/health.controller';
import { IdempotencyGuard } from './infrastructure/adapters/in/http/idempotency.guard';
import { IngestionGrpcController } from './infrastructure/adapters/in/grpc/ingestion.grpc.controller';
import { SagaCommandConsumer } from './infrastructure/adapters/in/messaging/saga-command.consumer';
import { AiNodeGrpcAdapter } from './infrastructure/adapters/out/grpc/ai-node-grpc.adapter';
import { RankingGrpcAdapter } from './infrastructure/adapters/out/grpc/ranking-grpc.adapter';
import { OutboxPoller } from './infrastructure/adapters/out/messaging/outbox-poller';
import { PersistenceModule } from './infrastructure/adapters/out/persistence/persistence.module';

const useCases = [
  {
    provide: IngestCvUseCase,
    useFactory: (curricula: CurriculumRepositoryPort, applications: PostulacionRepositoryPort, outbox: OutboxRepositoryPort, idempotency: IdempotencyPort, ai: AiNodeGrpcClientPort, unitOfWork: UnitOfWorkPort) =>
      new IngestCvUseCase(curricula, applications, outbox, idempotency, ai, unitOfWork),
    inject: [CURRICULUM_REPOSITORY, POSTULACION_REPOSITORY, OUTBOX_REPOSITORY, IDEMPOTENCY, AI_NODE_CLIENT, UNIT_OF_WORK],
  },
  {
    provide: SagaStep2BlockDossierUseCase,
    useFactory: (curricula: CurriculumRepositoryPort, applications: PostulacionRepositoryPort, outbox: OutboxRepositoryPort, unitOfWork: UnitOfWorkPort) =>
      new SagaStep2BlockDossierUseCase(curricula, applications, outbox, unitOfWork),
    inject: [CURRICULUM_REPOSITORY, POSTULACION_REPOSITORY, OUTBOX_REPOSITORY, UNIT_OF_WORK],
  },
  {
    provide: SagaStep2CompensateDossierUseCase,
    useFactory: (curricula: CurriculumRepositoryPort, applications: PostulacionRepositoryPort, outbox: OutboxRepositoryPort, unitOfWork: UnitOfWorkPort) =>
      new SagaStep2CompensateDossierUseCase(curricula, applications, outbox, unitOfWork),
    inject: [CURRICULUM_REPOSITORY, POSTULACION_REPOSITORY, OUTBOX_REPOSITORY, UNIT_OF_WORK],
  },
];

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/ingestion_db'),
    PrometheusModule.register({ path: '/metrics' }),
    PersistenceModule,
  ],
  controllers: [IngestionController, McpController, HealthController, IngestionGrpcController],
  providers: [
    ...useCases,
    IdempotencyGuard,
    AiNodeGrpcAdapter,
    RankingGrpcAdapter,
    { provide: AI_NODE_CLIENT, useExisting: AiNodeGrpcAdapter },
    OutboxPoller,
    SagaCommandConsumer,
  ],
})
export class AppModule {}
