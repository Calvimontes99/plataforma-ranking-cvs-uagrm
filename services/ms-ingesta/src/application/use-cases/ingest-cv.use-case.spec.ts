import { IngestCvUseCase } from './ingest-cv.use-case';
import { CurriculumRepositoryPort } from '../ports/out/curriculum-repository.port';
import { PostulacionRepositoryPort } from '../ports/out/postulacion-repository.port';
import { OutboxRepositoryPort } from '../ports/out/outbox-repository.port';
import { IdempotencyPort } from '../ports/out/idempotency.port';
import { AiNodeGrpcClientPort } from '../ports/out/ai-node-grpc-client.port';
import { CurriculumDocument } from '../../domain/entities/curriculum-document.entity';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { UnitOfWorkPort } from '../ports/out/unit-of-work.port';

describe('IngestCvUseCase', () => {
  it('persists an ingested CV and replays an idempotent request without duplicating records', async () => {
    let stored: CurriculumDocument | null = null;
    let idempotencyResult: { applicationId: string; resumeId: string } | null = null;
    const curricula: CurriculumRepositoryPort = {
      save: jest.fn(async (document) => { stored = document; }),
      findById: jest.fn(async () => stored),
      findByCandidateId: jest.fn(async () => stored),
      lock: jest.fn(async () => true),
      unlock: jest.fn(),
      searchBySkills: jest.fn(async () => []),
    };
    const applications = {
      save: jest.fn(),
      findById: jest.fn(),
      createIngestApplication: jest.fn(),
      withdrawParallel: jest.fn(),
      restoreWithdrawn: jest.fn(),
      setSelectedLocked: jest.fn(),
      revertSelectedToEvaluated: jest.fn(),
    } as unknown as PostulacionRepositoryPort;
    const outbox = { add: jest.fn(), findPending: jest.fn(), markPublished: jest.fn(), markFailed: jest.fn() } as unknown as OutboxRepositoryPort;
    const idempotency: IdempotencyPort = {
      find: jest.fn(async () => idempotencyResult),
      claim: jest.fn(async () => true),
      save: jest.fn(async (key, result) => { idempotencyResult = result; }),
      release: jest.fn(),
    };
    const ai: AiNodeGrpcClientPort = {
      extract: jest.fn(async () => ({ plainText: 'TypeScript engineer', skills: [{ name: 'TypeScript' }], experience: [], education: [], warnings: [] })),
    };
    const unitOfWork: UnitOfWorkPort = {
      execute: async <T>(work: () => Promise<T>): Promise<T> => work(),
    };
    const useCase = new IngestCvUseCase(curricula, applications, outbox, idempotency, ai, unitOfWork);
    const command = {
      idempotencyKey: 'uuid-key',
      candidateId: 'candidate-1',
      channel: 'web' as const,
      data: {
        skills: ['TypeScript'],
        applicant: { candidateId: 'candidate-1', fullName: 'Test Candidate', salaryExpectation: 8500 },
      },
    };

    const first = await useCase.execute(command);
    const replay = await useCase.execute(command);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.applicationId).toBe(first.applicationId);
    expect(curricula.save).toHaveBeenCalledTimes(1);
    expect(applications.save).toHaveBeenCalledTimes(1);
    expect(outbox.add).toHaveBeenCalledTimes(2);
    const ingestionEvent = (outbox.add as jest.Mock).mock.calls[0][0] as OutboxEvent;
    expect(ingestionEvent.payload['candidate']).toEqual(command.data.applicant);
  });
});
