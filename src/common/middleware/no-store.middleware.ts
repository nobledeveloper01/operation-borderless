import type { NextFunction, Request, Response } from 'express';

// Balances and tokens should never sit in a browser or proxy cache.
export function noStoreMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('Cache-Control', 'no-store');
  next();
}
