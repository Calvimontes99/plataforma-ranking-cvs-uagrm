import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { credentials, Client, loadPackageDefinition, ChannelCredentials } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { resolve } from 'node:path';

@Injectable()
export class RankingGrpcAdapter implements OnModuleDestroy {
  private readonly logger = new Logger(RankingGrpcAdapter.name);
  private readonly client: Client | null;

  constructor() {
    const address = process.env.MS_RANKING_GRPC_URL;
    if (!address) {
      this.client = null;
      return;
    }
    const protoPath = process.env.PROTO_PATH || resolve(process.cwd(), '../../proto/recruitment.proto');
    const definition = loadSync(protoPath, { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true });
    const root = loadPackageDefinition(definition) as unknown as {
      recruitment: { v1: { RankingService: new (url: string, creds: ChannelCredentials) => Client } };
    };
    this.client = new root.recruitment.v1.RankingService(address, credentials.createInsecure());
    this.logger.log(`Cliente gRPC de ms-ranking configurado: ${address}`);
  }

  onModuleDestroy(): void {
    this.client?.close();
  }
}
