import {
  BadRequestException, Body, Controller, Headers, Post, UploadedFile, UseFilters, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestCvUseCasePort } from '../../../../application/ports/in/ingest-cv-use-case.port';
import { IngestCvUseCase } from '../../../../application/use-cases/ingest-cv.use-case';
import { DomainExceptionFilter } from './domain-exception.filter';
import { IngestCvDto } from './ingestion.dto';
import { IdempotencyGuard } from './idempotency.guard';

@Controller('api/v1/ingestion')
@UseGuards(IdempotencyGuard)
@UseFilters(DomainExceptionFilter)
export class IngestionController {
  constructor(private readonly ingestCv: IngestCvUseCase) {}

  @Post('cvs')
  async ingestJson(@Body() body: IngestCvDto, @Headers('idempotency-key') idempotencyKey: string) {
    if (!body.resume) throw new BadRequestException('El campo resume es obligatorio');
    return this.ingestCv.execute({
      idempotencyKey, candidateId: body.candidateId, vacancyId: body.vacancyId,
      channel: body.channel || 'web', data: { ...body.resume, applicant: body.applicant },
      contentType: 'application/json',
    });
  }

  @Post('cvs/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: IngestCvDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!file) throw new BadRequestException('El archivo CV es obligatorio');
    if (![
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp',
    ].includes(file.mimetype)) {
      throw new BadRequestException('Formato no permitido; use PDF, DOCX o imagen JPEG, PNG o WebP');
    }
    return this.ingestCv.execute({
      idempotencyKey, candidateId: body.candidateId, vacancyId: body.vacancyId,
      channel: body.channel || 'web', fileName: file.originalname, contentType: file.mimetype, data: file.buffer,
      applicant: body.applicantName
        ? { candidateId: body.candidateId, fullName: body.applicantName }
        : undefined,
      metadata: {
        ...(body.localCvScore !== undefined ? { localCvScore: Number(body.localCvScore) } : {}),
        ...(body.interviewScore !== undefined ? { interviewScore: Number(body.interviewScore) } : {}),
        ...(body.capturedAt ? { capturedAt: body.capturedAt } : {}),
      },
    });
  }

  @Post('whatsapp')
  async ingestWhatsApp(@Body() body: IngestCvDto, @Headers('idempotency-key') idempotencyKey: string) {
    if (!body.resume) throw new BadRequestException('El campo resume es obligatorio');
    return this.ingestCv.execute({
      idempotencyKey, candidateId: body.candidateId, vacancyId: body.vacancyId,
      channel: 'whatsapp', data: { ...body.resume, applicant: body.applicant },
      contentType: 'application/json',
    });
  }
}
