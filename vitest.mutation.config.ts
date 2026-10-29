import { defineConfig } from 'vitest/config';

// Stryker reruns these for every mutant, so only fast unit tests that need no database belong here.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: [
      'test/unit/common/money/**/*.spec.ts',
      'test/unit/common/retry/**/*.spec.ts',
      'test/unit/property/**/*.spec.ts',
    ],
  },
});
