import type { NextFunction, Request, Response } from 'express';
import { noStoreMiddleware } from '../../../src/common/middleware/no-store.middleware.js';
import {
  requestIdMiddleware,
  type RequestWithId,
} from '../../../src/common/middleware/request-id.middleware.js';

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  headers: Record<string, string> = {},
) {
  const req = { headers } as unknown as RequestWithId;
  const set: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => (set[k] = v),
  } as unknown as Response;
  const next = vi.fn();
  middleware(req, res, next);
  return { req, set, next };
}

describe('middlewares', () => {
  it('keeps a safe incoming request ID', () => {
    const { req, set, next } = run(requestIdMiddleware, {
      'x-request-id': 'client-req-0001',
    });
    expect(req.id).toBe('client-req-0001');
    expect(set['X-Request-Id']).toBe('client-req-0001');
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces an unsafe or missing request ID', () => {
    expect(
      run(requestIdMiddleware, { 'x-request-id': 'bad id\n' }).req.id,
    ).toMatch(/^[0-9a-f-]{36}$/);
    expect(run(requestIdMiddleware).req.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('marks answers as not cacheable', () => {
    expect(run(noStoreMiddleware).set['Cache-Control']).toBe('no-store');
  });
});
