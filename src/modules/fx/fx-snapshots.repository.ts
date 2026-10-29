import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Fiat, FxSnapshot, FxSource, ProviderRates } from './fx.types.js';

interface SnapshotRow {
  id: string;
  source: FxSource;
  rates: Record<Fiat, string>;
  provider_updated_at: Date;
  fetched_at: Date;
}

const toSnapshot = (row: SnapshotRow): FxSnapshot => ({
  id: row.id,
  source: row.source,
  ratesPerUsd: row.rates,
  providerUpdatedAt: row.provider_updated_at,
  fetchedAt: row.fetched_at,
});

@Injectable()
export class FxSnapshotsRepository {
  constructor(private readonly db: DataSource) {}

  async save(rates: ProviderRates): Promise<FxSnapshot> {
    const rows = await this.db.query<SnapshotRow[]>(
      `INSERT INTO fx_snapshots (source, base, rates, provider_updated_at)
       VALUES ($1, 'USD', $2, $3)
       RETURNING id, source, rates, provider_updated_at, fetched_at`,
      [
        rates.source,
        JSON.stringify(rates.ratesPerUsd),
        rates.providerUpdatedAt,
      ],
    );
    return toSnapshot(rows[0]!);
  }

  // Live data always outranks the fixed demo table, which is only loaded at all when it is switched on.
  async latest(includeFixed: boolean): Promise<FxSnapshot | undefined> {
    const rows = await this.db.query<SnapshotRow[]>(
      `SELECT id, source, rates, provider_updated_at, fetched_at FROM fx_snapshots
        WHERE $1 OR source <> 'fixed-table'
        ORDER BY (source = 'fixed-table'), provider_updated_at DESC, fetched_at DESC LIMIT 1`,
      [includeFixed],
    );
    return rows[0] ? toSnapshot(rows[0]) : undefined;
  }
}
