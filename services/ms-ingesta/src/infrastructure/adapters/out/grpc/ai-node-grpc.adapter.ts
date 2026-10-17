import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { credentials, Client, loadPackageDefinition, ServiceError, ChannelCredentials } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { resolve } from 'node:path';
import { AiExtractionResult, AiNodeGrpcClientPort } from '../../../../application/ports/out/ai-node-grpc-client.port';

type AiGrpcClient = Client & {
  extractDocument(request: Record<string, unknown>, callback: (error: ServiceError | null, response?: Record<string, unknown>) => void): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class AiNodeGrpcAdapter implements AiNodeGrpcClientPort, OnModuleDestroy {
  private readonly logger = new Logger(AiNodeGrpcAdapter.name);
  private readonly client: AiGrpcClient | null;

  constructor() {
    const address = process.env.AI_NODE_GRPC_URL;
    if (!address) {
      this.client = null;
      return;
    }
    const protoPath = process.env.PROTO_PATH || resolve(process.cwd(), '../../proto/recruitment.proto');
    const definition = loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
    const root = loadPackageDefinition(definition) as unknown as {
      recruitment: { v1: { AiService: new (url: string, creds: ChannelCredentials) => AiGrpcClient } };
    };
    this.client = new root.recruitment.v1.AiService(address, credentials.createInsecure());
  }

  async extract(documentId: string, contentType: string, content: Buffer | string): Promise<AiExtractionResult> {
    if (!this.client) throw new Error('AI_NODE_GRPC_URL no está configurado');
    const response = await new Promise<Record<string, unknown>>((resolveResponse, reject) => {
      this.client!.extractDocument({
        documentId, documentType: 'DOCUMENT_TYPE_CV', contentType,
        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
      }, (error, result) => error ? reject(error) : resolveResponse(result || {}));
    });
    this.logger.debug(`Documento ${documentId} extraído por ai-node`);
    const skills = Array.isArray(response['skills'])
      ? response['skills'].flatMap((skill: unknown) => {
          if (!isRecord(skill) || typeof skill['name'] !== 'string') {
            return [];
          }
          return [{
            name: skill['name'],
            ...(typeof skill['proficiency'] === 'number' ? { proficiency: skill['proficiency'] } : {}),
            ...(typeof skill['yearsExperience'] === 'number' ? { yearsExperience: skill['yearsExperience'] } : {}),
          }];
        })
      : [];
    const additionalData = response['additionalData'];
    const warnings = Array.isArray(response['warnings'])
      ? response['warnings'].flatMap((warning: unknown) => {
          if (!isRecord(warning)) return [];
          const message = warning['message'];
          const code = warning['code'];
          return typeof message === 'string' ? [message] : typeof code === 'string' ? [code] : [];
        })
      : [];
    return {
      plainText: typeof response['extractedText'] === 'string' ? response['extractedText'] : '',
      skills,
      experience: Array.isArray(response['experience']) ? response['experience'] : [],
      education: Array.isArray(response['education']) ? response['education'] : [],
      ...(isRecord(additionalData)
        ? { additionalData }
        : {}),
      warnings,
    };
  }

  onModuleDestroy(): void {
    this.client?.close();
  }
}
