// Works out when to fetch rates next, so the primary is called about once a day, as it asks.

export const AFTER_PUBLICATION_MS = 5 * 60_000;
export const RETRY_AFTER_FAILURE_MS = 15 * 60_000;
export const RETRY_AFTER_RATE_LIMIT_MS = 30 * 60_000;
export const MIN_DELAY_MS = 60_000;

export type RefreshOutcome =
  | { kind: 'primary'; nextUpdateAt?: Date }
  | { kind: 'secondary' }
  | { kind: 'failed'; rateLimited: boolean };

export function nextRefreshDelay(
  outcome: RefreshOutcome,
  now: Date,
  random = Math.random,
): number {
  // A little jitter keeps several instances from calling the provider at the same second.
  const jitter = (ms: number) => Math.round(ms * (0.9 + random() * 0.2));
  if (outcome.kind === 'primary' && outcome.nextUpdateAt) {
    return Math.max(
      MIN_DELAY_MS,
      outcome.nextUpdateAt.getTime() + AFTER_PUBLICATION_MS - now.getTime(),
    );
  }
  if (outcome.kind === 'failed' && outcome.rateLimited)
    return jitter(RETRY_AFTER_RATE_LIMIT_MS);
  return jitter(RETRY_AFTER_FAILURE_MS);
}
