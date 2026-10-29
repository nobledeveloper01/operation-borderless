import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { formatAmount } from '../../common/money/amount.js';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import type { LedgerCheckDto } from './dto.js';

const CHECK_EVERY_MS = 3_600_000;
const MISMATCHES_SHOWN = 100;

@Injectable()
export class LedgerCheckService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerCheckService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly db: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.runQuietly(), CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  // Reads everything from one snapshot, so a transfer committing mid-check can't look like a mismatch.
  async check(): Promise<LedgerCheckDto> {
    const result = await this.db.transaction('REPEATABLE READ', async (m) => {
      await m.query('SET TRANSACTION READ ONLY');
      const [counts] = await m.query<{ balances: number; orphans: number }[]>(
        `SELECT (SELECT count(*)::int FROM balances) AS balances,
                (SELECT count(*)::int FROM transactions t
                  WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.transaction_id = t.id)) AS orphans`,
      );
      const rows = await m.query<
        {
          wallet_id: string;
          currency: string;
          balance: string;
          ledger: string;
          total: number;
        }[]
      >(
        `SELECT b.wallet_id, b.currency::text, b.amount::text AS balance,
                COALESCE(l.total, 0)::text AS ledger, count(*) OVER ()::int AS total
           FROM balances b
           LEFT JOIN (SELECT wallet_id, currency, sum(amount) AS total
                        FROM ledger_entries GROUP BY wallet_id, currency) l
             ON l.wallet_id = b.wallet_id AND l.currency = b.currency
          WHERE b.amount <> COALESCE(l.total, 0)
          ORDER BY b.wallet_id, b.currency
          LIMIT $1`,
        [MISMATCHES_SHOWN],
      );
      return { counts, rows };
    });
    const mismatchCount = result.rows[0]?.total ?? 0;
    const orphans = result.counts?.orphans ?? 0;
    this.metrics.ledgerMismatches.set(mismatchCount);
    this.metrics.ledgerCheckedAt.setToCurrentTime();
    return {
      ok: mismatchCount === 0 && orphans === 0,
      checkedAt: new Date().toISOString(),
      balancesChecked: result.counts?.balances ?? 0,
      mismatchCount,
      transactionsWithoutLines: orphans,
      mismatches: result.rows.map((r) => ({
        walletId: r.wallet_id,
        currency:
          r.currency as LedgerCheckDto['mismatches'][number]['currency'],
        balance: formatAmount(BigInt(r.balance)),
        ledger: formatAmount(BigInt(r.ledger)),
      })),
    };
  }

  private async runQuietly(): Promise<void> {
    try {
      const result = await this.check();
      if (!result.ok)
        this.logger.error(
          {
            mismatchCount: result.mismatchCount,
            transactionsWithoutLines: result.transactionsWithoutLines,
          },
          'Ledger check found balances that do not match their ledger lines',
        );
    } catch (error) {
      this.logger.warn(
        { reason: (error as Error).message },
        'Ledger check could not run',
      );
    }
  }
}
