import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRouteCoverage } from '../../support/route-coverage.js';

const spec = JSON.parse(
  readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> };
const every = Object.entries(spec.paths).flatMap(([path, item]) =>
  Object.keys(item).map(
    (m) => `${m.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`,
  ),
);

describe('route coverage check', () => {
  it('names every documented route that never answered with success', () => {
    const dir = mkdtempSync(join(tmpdir(), 'borderless-hits-'));
    writeFileSync(
      join(dir, 'hits-1.log'),
      'GET /health 200\nGET /api/v1/fx/rates 500\n',
    );
    expect(() => checkRouteCoverage(dir)).toThrow(/GET \/api\/v1\/fx\/rates/);
    expect(() => checkRouteCoverage(dir)).not.toThrow(/GET \/health[,\s]/);
  });

  it('passes when every route answered with success at least once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'borderless-hits-'));
    writeFileSync(
      join(dir, 'hits-1.log'),
      every.map((r) => `${r} 200`).join('\n'),
    );
    expect(() => checkRouteCoverage(dir)).not.toThrow();
  });
});
