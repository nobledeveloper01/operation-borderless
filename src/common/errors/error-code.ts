import { HttpStatus } from '@nestjs/common';

// Codes are part of the API contract: never rename one that is in use.
export const ErrorCode = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  ROUTE_NOT_FOUND: HttpStatus.NOT_FOUND,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  SERVICE_BUSY: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
} as const satisfies Record<string, HttpStatus>;

export type ErrorCode = keyof typeof ErrorCode;
