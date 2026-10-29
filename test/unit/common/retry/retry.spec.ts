import {
  DB_CONFLICT_RETRY,
  FX_FETCH_RETRY,
  fullJitterDelay,
  OUTBOX_RETRY,
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

  it('keeps the policies ADR-012 and ADR-016 document', () => {
    expect(FX_FETCH_RETRY).toEqual({
      retries: 2,
      baseDelayMs: 500,
      maxDelayMs: 4_000,
    });
    expect(DB_CONFLICT_RETRY).toEqual({
      retries: 2,
      baseDelayMs: 20,
      maxDelayMs: 200,
    });
    expect(OUTBOX_RETRY).toEqual({
      retries: 10,
      baseDelayMs: 1_000,
      maxDelayMs: 300_000,
    });
  });

  it('really waits between tries when no sleep is passed in', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const done = withRetry(
        () =>
          ++calls < 2
            ? Promise.reject(new Error('busy'))
            : Promise.resolve('ok'),
        { retries: 1, baseDelayMs: 1_000, maxDelayMs: 1_000 },
        () => true,
        { random: () => 0.5 },
      );
      await vi.advanceTimersByTimeAsync(499);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(done).resolves.toBe('ok');
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
