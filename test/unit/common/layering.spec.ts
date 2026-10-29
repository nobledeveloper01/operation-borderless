import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMMON = new URL('../../../src/common', import.meta.url).pathname;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
}

describe('layering', () => {
  it('keeps shared code free of imports from feature modules', () => {
    const offenders = files(COMMON).filter((file) =>
      /(?:from|import)\s*\(?\s*['"](?:\.\.?\/)+modules\//.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
