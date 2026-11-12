import { Body, Controller, MessageEvent, Post, Sse } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Observable, map } from 'rxjs';
import { NotificationsService, PlatformEvent } from './notifications.service';

class RegisterDeviceTokenBody {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @IsOptional() @IsString() @MaxLength(32) platform?: string;
  @IsOptional() @IsString() @MaxLength(200) userId?: string;
}

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('register-token')
  async registerToken(@Body() body: RegisterDeviceTokenBody): Promise<{ registered: boolean }> {
    await this.notifications.registerToken(body.token.trim(), body.platform?.trim() || 'unknown', body.userId?.trim());
    return { registered: true };
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.notifications.stream().pipe(map((event: PlatformEvent) => ({
      type: 'recruitment.update',
      data: event,
    })));
  }
}
