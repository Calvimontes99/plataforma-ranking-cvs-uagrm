import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  const protoPath = process.env.PROTO_PATH || resolve(process.cwd(), '../../proto/recruitment.proto');
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'recruitment.v1',
      protoPath,
      url: `0.0.0.0:${process.env.GRPC_PORT || 9091}`,
      loader: { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true },
    },
  });
  await app.startAllMicroservices();
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}

void bootstrap();
