import {
  appendFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export interface RouteHit {
  method: string;
  route: string;
  status: number;
}

// Every test app writes the route template and status of each answer, one file per worker.
export function recordRoutes(app: NestExpressApplication, dir: string): void {
  const file = join(dir, `hits-${process.pid}.log`);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      const template = (req.route as { path?: string } | undefined)?.path;
      if (template)
        appendFileSync(
          file,
          `${req.method} ${req.baseUrl}${template} ${res.statusCode}\n`,
        );
    });
    next();
  });
}

export function readHits(dir: string): RouteHit[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith('hits-'))
    .flatMap((f) => readFileSync(join(dir, f), 'utf8').split('\n'))
    .filter(Boolean)
    .map((line) => {
      const [method, route, status] = line.split(' ');
      return { method: method!, route: route!, status: Number(status) };
    });
}

interface Operation {
  method: string;
  route: string;
  summary: string;
  documented: number[];
}

function operations(): Operation[] {
  const spec = JSON.parse(
    readFileSync(new URL('../../docs/openapi.json', import.meta.url), 'utf8'),
  ) as {
    paths: Record<
      string,
      Record<string, { summary?: string; responses: Record<string, unknown> }>
    >;
  };
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({
      method: method.toUpperCase(),
      route: path.replace(/\{(\w+)\}/g, ':$1'),
      summary: op.summary ?? '',
      documented: Object.keys(op.responses).map(Number),
    })),
  );
}

// Fails the run when a documented route never answered with success; optionally writes the table.
export function checkRouteCoverage(dir: string, writeTo?: URL): void {
  const hits = readHits(dir);
  if (hits.length === 0) return;
  const rows = operations().map((op) => {
    const seen = [
      ...new Set(
        hits
          .filter((h) => h.method === op.method && h.route === op.route)
          .map((h) => h.status),
      ),
    ].sort((a, b) => a - b);
    return {
      ...op,
      seen,
      calls: hits.filter((h) => h.method === op.method && h.route === op.route)
        .length,
    };
  });
  if (writeTo) {
    const lines = rows.map(
      (r) =>
        `| \`${r.method} ${r.route}\` | ${r.summary} | ${r.calls} | ${r.seen.join(', ')} | ${r.documented.filter((s) => !r.seen.includes(s)).join(', ') || '-'} |`,
    );
    writeFileSync(
      writeTo,
      `# API Test Coverage\n\nWritten by \`yarn test:routes\` from a full test run: every request the API test apps\nanswered, by route template and status. \`yarn test\` fails if a documented route never answers\nwith success.\n\n| Route | What | Calls | Statuses tested | Documented but not tested |\n| --- | --- | --: | --- | --- |\n${lines.join('\n')}\n`,
    );
  }
  const untested = rows.filter((r) => !r.seen.some((s) => s >= 200 && s < 300));
  if (untested.length > 0) {
    throw new Error(
      `These routes never answered with success in the tests: ${untested.map((r) => `${r.method} ${r.route}`).join(', ')}`,
    );
  }
}
