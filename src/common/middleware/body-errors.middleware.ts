import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

// Turns the JSON parser's own messages into the API's error, before Nest passes the raw text on.
export function bodyErrorsMiddleware(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const type = (error as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed' || error instanceof SyntaxError) {
    next(
      new AppError('VALIDATION_FAILED', 'The request body is not valid JSON.'),
    );
    return;
  }
  next(error);
}
