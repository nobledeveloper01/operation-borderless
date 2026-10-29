import { Param, ParseUUIDPipe } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';

// Reads a UUID route parameter and answers 400 with its own name when it isn't one.
export const IdParam = (name: string) =>
  Param(
    name,
    new ParseUUIDPipe({
      exceptionFactory: () =>
        new AppError('VALIDATION_FAILED', `${name} must be a UUID.`),
    }),
  );
