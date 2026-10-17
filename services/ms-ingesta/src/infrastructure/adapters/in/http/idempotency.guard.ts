import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import { validate as validateUuid } from 'uuid';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const value = request.headers['idempotency-key'];
    const key = Array.isArray(value) ? value[0] : value;
    if (!key || !validateUuid(key) || key[14] !== '4' || !'89ab'.includes(key[19]?.toLowerCase() || '')) {
      throw new BadRequestException('Idempotency-Key debe ser un UUIDv4 válido');
    }
    return true;
  }
}
