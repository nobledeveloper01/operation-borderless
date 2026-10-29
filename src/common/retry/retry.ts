export interface RetryPolicy {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

// FX providers get a few slow, spread-out tries; a provider that is down stays down for seconds.
export const FX_FETCH_RETRY: RetryPolicy = {
  retries: 2,
  baseDelayMs: 500,
  maxDelayMs: 4_000,
};

// A deadlock or serialization failure clears in milliseconds, so the money transaction retries fast.
export const DB_CONFLICT_RETRY: RetryPolicy = {
  retries: 2,
  baseDelayMs: 20,
  maxDelayMs: 200,
};

export interface RetryOptions {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Full jitter: a random wait between zero and the capped exponential step, so retries never line up.
export function fullJitterDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  return (
    random() * Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt)
  );
}

// Runs the work, and runs it again after a jittered wait while the error is one a retry could fix.
export async function withRetry<T>(
  work: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  shouldRetry: (error: unknown) => boolean,
  options: RetryOptions = {},
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await work(attempt);
    } catch (error) {
      if (attempt >= policy.retries || !shouldRetry(error)) throw error;
      const delay = fullJitterDelay(attempt + 1, policy, options.random);
      options.onRetry?.(attempt + 1, error, delay);
      await sleep(delay);
    }
  }
}
