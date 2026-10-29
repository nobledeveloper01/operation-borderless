import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import type { RequestWithId } from '../middleware/request-id.middleware.js';
import { RESPONSE_MESSAGE } from './response-message.decorator.js';
import type { SuccessResponseDto } from './success-response.dto.js';

const DEFAULT_MESSAGE = 'Request completed';

// Every successful answer leaves through here, so clients always get the same shape.
@Injectable()
export class SuccessInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponseDto<T>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponseDto<T>> {
    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    const message =
      this.reflector.getAllAndOverride<string | undefined>(RESPONSE_MESSAGE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_MESSAGE;

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        statusCode: res.statusCode,
        message,
        data,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
