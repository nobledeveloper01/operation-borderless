import { nextRefreshDelay } from '../../../src/fx/refresh-schedule.js';

const now = new Date('2026-10-29T12:00:00Z');
const mid = () => 0.5;

describe('nextRefreshDelay', () => {
  it('TC-018 waits until five minutes after the primary publishes next', () => {
    const next = new Date('2026-10-30T00:19:41Z');
    expect(
      nextRefreshDelay({ kind: 'primary', nextUpdateAt: next }, now, mid),
    ).toBe(next.getTime() + 300_000 - now.getTime());
  });

  it('never refreshes sooner than a minute, even if the publication time has passed', () => {
    expect(
      nextRefreshDelay(
        { kind: 'primary', nextUpdateAt: new Date('2026-10-29T11:00:00Z') },
        now,
        mid,
      ),
    ).toBe(60_000);
  });

  it('retries in about 15 minutes after a failure, and about 30 after a rate limit', () => {
    expect(
      nextRefreshDelay({ kind: 'failed', rateLimited: false }, now, mid),
    ).toBe(900_000);
    expect(
      nextRefreshDelay({ kind: 'secondary', rateLimited: false }, now, mid),
    ).toBe(900_000);
    expect(
      nextRefreshDelay({ kind: 'failed', rateLimited: true }, now, mid),
    ).toBe(1_800_000);
    expect(
      nextRefreshDelay({ kind: 'failed', rateLimited: false }, now, () => 0),
    ).toBe(810_000);
  });

  it('never trusts a far-off next-update time: it refreshes before the rates go stale, and within a day', () => {
    const staleAt = new Date(now.getTime() + 10 * 3_600_000);
    const farAway = {
      kind: 'primary' as const,
      nextUpdateAt: new Date(now.getTime() + 40 * 86_400_000),
    };
    expect(nextRefreshDelay(farAway, now, mid, staleAt)).toBeLessThanOrEqual(
      10 * 3_600_000,
    );
    expect(nextRefreshDelay(farAway, now, mid)).toBeLessThanOrEqual(
      24 * 3_600_000,
    );
  });
});
