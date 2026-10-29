import { applyDecorators, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsUUID } from 'class-validator';
import { AppError } from '../errors/app-error.js';

// Postgres ignores case in UUIDs, so the API lowercases them before any comparison.
const lowercase = (value: unknown): unknown =>
  typeof value === 'string' ? value.toLowerCase() : value;

// Reads a UUID route parameter and answers 400 with its own name when it isn't one.
export const IdParam = (name: string) =>
  Param(
    name,
    new ParseUUIDPipe({
      exceptionFactory: () =>
        new AppError('VALIDATION_FAILED', `${name} must be a UUID.`),
    }),
    { transform: (value: string) => value.toLowerCase() },
  );

// A UUID in a request body, checked and lowercased the same way as route parameters.
export const UuidField = (
  name: string,
  description: string,
  { required = true }: { required?: boolean } = {},
) =>
  applyDecorators(
    ApiProperty({ description, format: 'uuid', required }),
    Transform(({ value }) => lowercase(value)),
    IsUUID('all', { message: `${name} must be a UUID.` }),
  );
