import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { DomainException } from '../../../../domain/exceptions/domain.exception';

@Catch(DomainException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { json(body: Record<string, unknown>): void };
    }>();
    const status = exception.code === 'IDEMPOTENCY_IN_PROGRESS' ? 409 : 400;
    response.status(status).json({
      statusCode: status,
      error: status === 409 ? 'Conflict' : 'Bad Request',
      code: exception.code,
      message: exception.message,
    });
  }
}
