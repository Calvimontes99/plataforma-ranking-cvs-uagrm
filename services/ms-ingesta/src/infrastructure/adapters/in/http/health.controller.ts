import { Controller, Get } from '@nestjs/common';

@Controller(['health', 'api/v1/ingestion/health'])
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', component: 'ms-ingesta' };
  }
}
