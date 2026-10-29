import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EnvironmentVariables } from '../../common/config/env.validation.js';
import type { Stablecoin } from '../../common/currencies/currency.js';
import { formatAmount } from '../../common/money/amount.js';
import { convert } from '../../common/money/rate.js';
import { FxService } from '../fx/fx.service.js';
import type { Leg, Posted } from '../ledger/ledger.service.js';

export type EventType =
  | 'deposit.completed'
  | 'swap.completed'
  | 'transfer.sent'
  | 'transfer.received'
  | 'balance.low';

interface NewEvent {
  type: EventType;
  walletId: string;
  payload: Record<string, unknown>;
}

// Writes events in the caller's money transaction, so an event exists if and only if the movement does.
@Injectable()
export class OutboxService {
  constructor(
    private readonly fx: FxService,
    private readonly config: EnvironmentVariables,
  ) {}

  async record(
    manager: EntityManager,
    posted: Posted,
    legs: Leg[],
  ): Promise<void> {
    const events = [
      ...this.movementEvents(posted),
      ...this.lowBalanceEvents(posted, legs),
    ];
    for (const event of events) {
      await manager.query(
        `INSERT INTO outbox_events (type, wallet_id, transaction_id, payload) VALUES ($1, $2, $3, $4)`,
        [
          event.type,
          event.walletId,
          posted.transaction.id,
          JSON.stringify(event.payload),
        ],
      );
    }
  }

  // Payloads carry IDs and amounts only, never an email or phone number.
  private movementEvents(posted: Posted): NewEvent[] {
    const t = posted.transaction;
    const money = {
      transactionId: t.id,
      fromCurrency: t.from_currency,
      fromAmount:
        t.from_amount === null ? null : formatAmount(BigInt(t.from_amount)),
      toCurrency: t.to_currency,
      toAmount: formatAmount(BigInt(t.to_amount)),
    };
    if (t.type === 'DEPOSIT')
      return [
        { type: 'deposit.completed', walletId: t.to_wallet_id, payload: money },
      ];
    if (t.type === 'SWAP')
      return [
        { type: 'swap.completed', walletId: t.to_wallet_id, payload: money },
      ];
    return [
      {
        type: 'transfer.sent',
        walletId: t.from_wallet_id!,
        payload: { ...money, toWalletId: t.to_wallet_id },
      },
      {
        type: 'transfer.received',
        walletId: t.to_wallet_id,
        payload: { ...money, fromWalletId: t.from_wallet_id },
      },
    ];
  }

  // Fires once when a debit crosses the line, not on every debit below it; skipped when no fresh rate exists.
  private lowBalanceEvents(posted: Posted, legs: Leg[]): NewEvent[] {
    const threshold = BigInt(this.config.LOW_BALANCE_USD) * 1_000_000n;
    if (threshold === 0n) return [];
    const events: NewEvent[] = [];
    for (const leg of legs) {
      if (leg.delta >= 0n) continue;
      const after = posted.balancesAfter.find(
        (b) => b.walletId === leg.walletId && b.currency === leg.currency,
      )?.amount;
      if (after === undefined) continue;
      const usd = this.usd(leg.currency);
      if (!usd) continue;
      const before = usd(after - leg.delta);
      const now = usd(after);
      if (before >= threshold && now < threshold) {
        events.push({
          type: 'balance.low',
          walletId: leg.walletId,
          payload: {
            transactionId: posted.transaction.id,
            currency: leg.currency,
            amount: formatAmount(after),
            usdValue: formatAmount(now),
            thresholdUsd: formatAmount(threshold),
          },
        });
      }
    }
    return events;
  }

  private usd(currency: Stablecoin): ((amount: bigint) => bigint) | undefined {
    try {
      const { rate } = this.fx.quote(currency, 'USDx');
      return (amount) => convert(amount, rate);
    } catch {
      return undefined;
    }
  }
}
