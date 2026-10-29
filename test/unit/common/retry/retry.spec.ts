import {
  DB_CONFLICT_RETRY,
  fullJitterDelay,
  withRetry,
} from '../../../../src/common/retry/retry.js';

const policy = { retries: 3, baseDelayMs: 100, maxDelayMs: 500 };

describe('retry', () => {
  it('waits a random time up to the capped exponential step', () => {
    expect(fullJitterDelay(1, policy, () => 0)).toBe(0);
    expect(fullJitterDelay(1, policy, () => 0.999999)).toBeCloseTo(200);
    expect(fullJitterDelay(2, policy, () => 0.999999)).toBeCloseTo(400);
    expect(fullJitterDelay(5, policy, () => 0.999999)).toBeCloseTo(500);
  });

  it('retries a fixable error until it succeeds, with jittered waits', async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRetry(
      () =>
        ++calls < 3 ? Promise.reject(new Error('busy')) : Promise.resolve('ok'),
      policy,
      () => true,
      {
        sleep: (ms) => Promise.resolve(void waits.push(ms)),
        random: () => 0.5,
      },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([100, 200]);
  });

  it('gives up after the last retry and throws the last error', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => Promise.reject(new Error(`try ${++calls}`)),
        DB_CONFLICT_RETRY,
        () => true,
        { sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow('try 3');
    expect(calls).toBe(3);
  });

  it('never retries an error the caller says a retry cannot fix', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => Promise.reject(new Error(`try ${++calls}`)),
        policy,
        () => false,
      ),
    ).rejects.toThrow('try 1');
    expect(calls).toBe(1);
  });
});
