import {
  applyDecorators,
  HttpCode,
  HttpStatus,
  type Type,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  getSchemaPath,
} from '@nestjs/swagger';
import { type Access, RouteAccess } from '../../auth/access.decorators.js';
import { SkipThrottle } from '@nestjs/throttler';
import { RateLimited, type RateLimitGroup } from '../http/rate-limit-groups.js';
import { ErrorResponseDto } from '../errors/error-response.dto.js';
import { ResponseMessage } from './response-message.decorator.js';
import { SuccessResponseDto } from './success-response.dto.js';

export interface EndpointOptions {
  summary: string;
  message: string;
  status?: HttpStatus;
  type?: Type<unknown>;
  isArray?: boolean;
  errors?: HttpStatus[];
  description?: string;
  access?: Access;
  // A group adds a tighter limit; 'none' takes the route out of rate limiting altogether.
  rateLimit?: RateLimitGroup | 'none';
  // Money writes need an Idempotency-Key header; this documents it and its errors once.
  idempotent?: boolean;
}

const IDEMPOTENCY_HEADER_DOC = {
  name: 'Idempotency-Key',
  required: true,
  description:
    '8 to 128 characters of A-Z, a-z, 0-9, _ or -. A retry with the same key and body returns the first answer; the same key with another body is refused.',
  schema: {
    type: 'string',
    pattern: '^[A-Za-z0-9_-]{8,128}$',
    example: '7b0c3e9a-4d1f-4c62-9a55-2f9e1b7c0d11',
  },
};

// Any route can hit this, so no controller has to list it again.
const COMMON_ERRORS = [HttpStatus.INTERNAL_SERVER_ERROR];

// One decorator per route sets who may call it, its status, its message and its whole Swagger contract.
export function ApiEndpoint(options: EndpointOptions) {
  const status = options.status ?? HttpStatus.OK;
  const dataSchema = options.type
    ? options.isArray
      ? { type: 'array', items: { $ref: getSchemaPath(options.type) } }
      : { $ref: getSchemaPath(options.type) }
    : { type: 'object', nullable: true };
  const access = options.access ?? 'any';
  const accessErrors =
    access === 'public'
      ? []
      : access === 'session'
        ? [HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]
        : [HttpStatus.UNAUTHORIZED];
  // Money writes take row locks, so a lock timeout can answer 503 SERVICE_BUSY.
  const idempotencyErrors = options.idempotent
    ? [
        HttpStatus.BAD_REQUEST,
        HttpStatus.UNPROCESSABLE_ENTITY,
        HttpStatus.SERVICE_UNAVAILABLE,
      ]
    : [];
  const throttleErrors =
    options.rateLimit === 'none' ? [] : [HttpStatus.TOO_MANY_REQUESTS];
  const errors = [
    ...new Set([
      ...(options.errors ?? []),
      ...idempotencyErrors,
      ...accessErrors,
      ...throttleErrors,
      ...COMMON_ERRORS,
    ]),
  ];
  const security =
    access === 'public'
      ? []
      : access === 'session'
        ? [ApiBearerAuth('bearer')]
        : [ApiBearerAuth('bearer'), ApiSecurity('walletKey')];

  return applyDecorators(
    RouteAccess(access),
    ...(options.rateLimit === 'none'
      ? [SkipThrottle()]
      : options.rateLimit
        ? [RateLimited(options.rateLimit)]
        : []),
    ...(options.idempotent ? [ApiHeader(IDEMPOTENCY_HEADER_DOC)] : []),
    ...security,
    HttpCode(status),
    ResponseMessage(options.message),
    ApiOperation({
      summary: options.summary,
      description: options.description,
    }),
    ApiExtraModels(
      SuccessResponseDto,
      ErrorResponseDto,
      ...(options.type ? [options.type] : []),
    ),
    ApiResponse({
      status,
      description: options.message,
      schema: {
        allOf: [
          { $ref: getSchemaPath(SuccessResponseDto) },
          {
            properties: {
              statusCode: { example: status },
              message: { example: options.message },
              data: dataSchema,
            },
          },
        ],
      },
    }),
    ...errors.map((code) =>
      ApiResponse({
        status: code,
        description: ERROR_DESCRIPTIONS[code] ?? 'Error',
        schema: {
          allOf: [
            { $ref: getSchemaPath(ErrorResponseDto) },
            { properties: { statusCode: { example: code } } },
          ],
        },
      }),
    ),
  );
}

const ERROR_DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'The request is not valid',
  [HttpStatus.UNAUTHORIZED]: 'Missing, wrong or expired credentials',
  [HttpStatus.FORBIDDEN]: 'These credentials cannot do this',
  [HttpStatus.NOT_FOUND]: 'Not found, or not yours',
  [HttpStatus.CONFLICT]: 'Conflicts with existing data',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Refused by a business rule',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Unexpected error',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'A dependency is unavailable; try again',
};
