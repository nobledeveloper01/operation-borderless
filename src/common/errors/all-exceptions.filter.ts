import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { AppError } from './app-error.js';
import type { ErrorResponseDto } from './error-response.dto.js';

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const PG_LOCK_TIMEOUT = '55P03';
const PG_STATEMENT_TIMEOUT = '57014';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string }>();
    const res = http.getResponse<Response>();
    const mapped = this.map(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        { err: exception, requestId: req.id },
        'Request failed',
      );
    }

    const body: ErrorResponseDto = {
      statusCode: mapped.status,
      error: STATUS_CODES[mapped.status] ?? 'Error',
      code: mapped.code,
      message: mapped.message,
      ...(mapped.details ? { details: mapped.details } : {}),
      requestId: String(req.id ?? ''),
      path: req.originalUrl.split('?')[0] ?? req.originalUrl,
      timestamp: new Date().toISOString(),
    };
    res.status(mapped.status).json(body);
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Try again shortly.',
      };
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    const pgCode = (exception as { code?: unknown } | null)?.code;
    if (pgCode === PG_LOCK_TIMEOUT || pgCode === PG_STATEMENT_TIMEOUT) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVICE_BUSY',
        message: 'The service is busy. Try again shortly.',
      };
    }
    const bodyParserType = (exception as { type?: unknown } | null)?.type;
    if (bodyParserType === 'entity.too.large') {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.',
      };
    }
    if (bodyParserType === 'entity.parse.failed') {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'The request body is not valid JSON.',
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }

  private fromHttpException(exception: HttpException): Mapped {
    const status: HttpStatus = exception.getStatus();
    const response = exception.getResponse();
    const raw =
      typeof response === 'object' && response !== null
        ? (response as { message?: unknown }).message
        : response;
    const list: unknown[] = Array.isArray(raw) ? raw : [raw];
    const strings = list.filter((m): m is string => typeof m === 'string');
    const messages = strings.length > 0 ? strings : [exception.message];

    if (status === HttpStatus.NOT_FOUND) {
      return {
        status,
        code: 'ROUTE_NOT_FOUND',
        message: 'This route does not exist.',
      };
    }
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      return {
        status,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.',
      };
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return {
        status,
        code: 'VALIDATION_FAILED',
        message: messages[0] ?? 'The request is not valid.',
        ...(messages.length > 1 ? { details: { errors: messages } } : {}),
      };
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
      };
    }
    return {
      status,
      code: STATUS_CODES[status]?.toUpperCase().replace(/\W+/g, '_') ?? 'ERROR',
      message: messages[0] ?? '',
    };
  }
}
