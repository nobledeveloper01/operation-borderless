import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export type RequestWithId = Request & { id: string };

// Reuses the caller's request ID when it looks safe, so both sides can trace the same request.
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_ID.test(incoming)
      ? incoming
      : randomUUID();
  (req as RequestWithId).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
