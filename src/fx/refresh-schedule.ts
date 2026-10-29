// Works out when to fetch rates next, so the primary is called about once a day, as it asks.

export const AFTER_PUBLICATION_MS = 5 * 60_000;
export const RETRY_AFTER_FAILURE_MS = 15 * 60_000;
export const RETRY_AFTER_RATE_LIMIT_MS = 30 * 60_000;
export const MIN_DELAY_MS = 60_000;
export const MAX_DELAY_MS = 24 * 3_600_000;
const BEFORE_STALE_MS = 15 * 60_000;

export type RefreshOutcome =
  | { kind: 'primary'; nextUpdateAt?: Date }
  | { kind: 'secondary'; rateLimited: boolean }
  | { kind: 'failed'; rateLimited: boolean };

// The provider's next-update time is a hint, so it is capped at a day and at the moment the current rates go stale.
export function nextRefreshDelay(
  outcome: RefreshOutcome,
  now: Date,
  random = Math.random,
  staleAt?: Date,
): number {
  const jitter = (ms: number) => Math.round(ms * (0.9 + random() * 0.2));
  let delay: number;
  if (outcome.kind === 'primary' && outcome.nextUpdateAt) {
    delay =
      outcome.nextUpdateAt.getTime() + AFTER_PUBLICATION_MS - now.getTime();
  } else if (outcome.kind !== 'primary' && outcome.rateLimited) {
    delay = jitter(RETRY_AFTER_RATE_LIMIT_MS);
  } else if (outcome.kind === 'primary') {
    delay = jitter(MAX_DELAY_MS);
  } else {
    delay = jitter(RETRY_AFTER_FAILURE_MS);
  }
  const ceiling = staleAt
    ? Math.min(
        MAX_DELAY_MS,
        staleAt.getTime() - BEFORE_STALE_MS - now.getTime(),
      )
    : MAX_DELAY_MS;
  return Math.max(MIN_DELAY_MS, Math.min(delay, ceiling));
}
