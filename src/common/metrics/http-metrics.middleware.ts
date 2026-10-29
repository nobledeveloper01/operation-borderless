import type { NextFunction, Request, Response } from 'express';
import type { MetricsService } from './metrics.service.js';

// Labels use the route template, never the real path, so wallet IDs can't blow up the label count.
export function httpMetricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const end = metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const template = (req.route as { path?: string } | undefined)?.path;
      const route = template ? `${req.baseUrl}${template}` : 'unmatched';
      end({ method: req.method, route });
      metrics.httpRequests.inc({
        method: req.method,
        route,
        status: String(res.statusCode),
      });
    });
    next();
  };
}
