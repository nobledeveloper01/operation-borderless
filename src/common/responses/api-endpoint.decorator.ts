import {
  applyDecorators,
  HttpCode,
  HttpStatus,
  type Type,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
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
}

// Any route can hit these, so no controller has to list them again.
const COMMON_ERRORS = [
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
];

// One decorator per route sets its status, its message and its whole Swagger contract.
export function ApiEndpoint(options: EndpointOptions) {
  const status = options.status ?? HttpStatus.OK;
  const dataSchema = options.type
    ? options.isArray
      ? { type: 'array', items: { $ref: getSchemaPath(options.type) } }
      : { $ref: getSchemaPath(options.type) }
    : { type: 'object', nullable: true };
  const errors = [...new Set([...(options.errors ?? []), ...COMMON_ERRORS])];

  return applyDecorators(
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
