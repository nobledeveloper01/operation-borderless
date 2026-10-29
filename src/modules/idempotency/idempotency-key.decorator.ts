import { createHash } from 'node:crypto';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common/errors/app-error.js';

export interface IdempotencyRequest {
  key: string;
  // A hash of the method, path and body, so a reused key with a different request can be spotted.
  fingerprint: Buffer;
}

const KEY = /^[A-Za-z0-9_-]{8,128}$/;

// Sorting keys first means {"a":1,"b":2} and {"b":2,"a":1} count as the same request.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function fingerprintOf(
  method: string,
  path: string,
  body: unknown,
): Buffer {
  return createHash('sha256')
    .update(
      JSON.stringify([method.toUpperCase(), path, canonical(body ?? null)]),
    )
    .digest();
}

// Reads and checks the Idempotency-Key header that every money write must carry.
export const Idempotency = createParamDecorator(
  (_data: unknown, context: ExecutionContext): IdempotencyRequest => {
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY.test(key)) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'Send an Idempotency-Key header of 8 to 128 letters, digits, _ or -. A random UUID works well.',
      );
    }
    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    return { key, fingerprint: fingerprintOf(req.method, path, req.body) };
  },
);
