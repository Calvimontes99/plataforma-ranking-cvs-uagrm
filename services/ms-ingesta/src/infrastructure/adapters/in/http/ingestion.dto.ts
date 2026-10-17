import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class IngestCvDto {
  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  vacancyId?: string;

  @IsOptional()
  @IsIn(['web', 'mobile', 'whatsapp'])
  channel?: 'web' | 'mobile' | 'whatsapp';

  @IsOptional()
  @IsObject()
  resume?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  applicant?: Record<string, unknown>;
}
