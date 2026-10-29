import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

// Each app gets its own registry, so test apps in one process never share counters.
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'borderless_http_requests_total',
    help: 'HTTP requests by method, route template and status.',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: 'borderless_http_request_duration_seconds',
    help: 'Time from request to response, by method and route template.',
    labelNames: ['method', 'route'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  readonly moneyMovements = new Counter({
    name: 'borderless_money_movements_total',
    help: 'Deposits, swaps and transfers posted to the ledger.',
    labelNames: ['type'],
    registers: [this.registry],
  });

  readonly dbConflictRetries = new Counter({
    name: 'borderless_db_conflict_retries_total',
    help: 'Money transactions rerun after a deadlock or serialization failure.',
    labelNames: ['code'],
    registers: [this.registry],
  });

  readonly idempotentReplays = new Counter({
    name: 'borderless_idempotent_replays_total',
    help: 'Money requests answered from a stored result instead of running again.',
    registers: [this.registry],
  });

  readonly fxRefreshes = new Counter({
    name: 'borderless_fx_refreshes_total',
    help: 'FX refreshes by outcome: primary, secondary or failed.',
    labelNames: ['outcome'],
    registers: [this.registry],
  });

  readonly outboxDelivered = new Counter({
    name: 'borderless_outbox_delivered_total',
    help: 'Outbox events delivered, by type.',
    labelNames: ['type'],
    registers: [this.registry],
  });

  readonly outboxFailures = new Counter({
    name: 'borderless_outbox_failures_total',
    help: 'Failed outbox deliveries, by type; final="true" means the event gave up.',
    labelNames: ['type', 'final'],
    registers: [this.registry],
  });

  readonly ledgerMismatches = new Gauge({
    name: 'borderless_ledger_mismatches',
    help: 'Balances that differed from their ledger lines at the last check.',
    registers: [this.registry],
  });

  readonly ledgerCheckedAt = new Gauge({
    name: 'borderless_ledger_last_check_timestamp_seconds',
    help: 'When the last ledger check finished, as a Unix time.',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'borderless_' });
  }

  // A gauge whose value is read at scrape time, so it can never be out of date.
  watch(name: string, help: string, read: () => number | undefined): void {
    new Gauge({
      name,
      help,
      registers: [this.registry],
      collect() {
        const value = read();
        if (value === undefined) this.reset();
        else this.set(value);
      },
    });
  }

  // Like watch, for values that need a database read; a failed read leaves the gauge empty.
  watchAsync(name: string, help: string, read: () => Promise<number>): void {
    new Gauge({
      name,
      help,
      registers: [this.registry],
      async collect() {
        try {
          this.set(await read());
        } catch {
          this.reset();
        }
      },
    });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
