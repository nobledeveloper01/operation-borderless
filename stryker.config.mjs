// Mutation testing for the money maths and retry policy: yarn test:mutation.
export default {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutation.config.ts' },
  mutate: ['src/common/money/**/*.ts', 'src/common/retry/**/*.ts'],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 95, low: 90, break: 90 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
};
