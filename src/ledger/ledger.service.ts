import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import { formatAmount } from '../common/money/amount.js';
import type { Stablecoin } from '../currencies/currency.js';
import { returned } from '../database/returned.js';
import { TRANSACTION_COLUMNS } from '../transactions/transaction.mapper.js';
import type {
  TransactionRow,
  TransactionType,
} from '../transactions/transaction.dto.js';

export interface Leg {
  walletId: string;
  currency: Stablecoin;
  delta: bigint;
}

export interface NewTransaction {
  type: TransactionType;
  fromWalletId: string | null;
  toWalletId: string;
  fromCurrency: Stablecoin | null;
  fromAmount: bigint | null;
  toCurrency: Stablecoin;
  toAmount: bigint;
  rate: string;
  rateSource: string;
  rateAsOf: Date | null;
  fxSnapshotId: string | null;
}

export interface Posted {
  transaction: TransactionRow;
  balancesAfter: { walletId: string; currency: Stablecoin; amount: bigint }[];
}

// The largest amount, in millionths, that a balance column can store.
export const MAX_BALANCE = 9_223_372_036_854_775_807n;

const legKey = (leg: { walletId: string; currency: string }) =>
  `${leg.walletId}:${leg.currency}`;

// The only code that changes balances: every deposit, swap and transfer is posted through here.
@Injectable()
export class LedgerService {
  // Locks, checks and moves money in one go; it must run inside the caller's transaction.
  async post(
    manager: EntityManager,
    tx: NewTransaction,
    legs: Leg[],
  ): Promise<Posted> {
    const held = await this.lock(manager, legs);
    for (const leg of legs) {
      const available = held.get(legKey(leg)) ?? 0n;
      if (leg.delta < 0n && available + leg.delta < 0n) {
        throw new AppError(
          'INSUFFICIENT_FUNDS',
          `The ${leg.currency} balance is too low for this.`,
          {
            currency: leg.currency,
            available: formatAmount(available),
            requested: formatAmount(-leg.delta),
          },
        );
      }
      if (leg.delta > 0n && available + leg.delta > MAX_BALANCE) {
        throw new AppError(
          'BALANCE_LIMIT',
          `This would take the ${leg.currency} balance past the most a wallet can hold.`,
          {
            currency: leg.currency,
            maximum: formatAmount(MAX_BALANCE),
          },
        );
      }
    }

    const rows = await manager.query<TransactionRow[]>(
      `INSERT INTO transactions (type, from_wallet_id, to_wallet_id, from_currency, from_amount, to_currency, to_amount,
                                 rate, rate_source, rate_as_of, fx_snapshot_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING ${TRANSACTION_COLUMNS}`,
      [
        tx.type,
        tx.fromWalletId,
        tx.toWalletId,
        tx.fromCurrency,
        tx.fromAmount?.toString() ?? null,
        tx.toCurrency,
        tx.toAmount.toString(),
        tx.rate,
        tx.rateSource,
        tx.rateAsOf,
        tx.fxSnapshotId,
      ],
    );
    const transaction = rows[0]!;

    const balancesAfter: Posted['balancesAfter'] = [];
    for (const leg of legs) {
      const updated = returned<{ amount: string }>(
        await manager.query(
          `UPDATE balances SET amount = amount + $3, updated_at = now()
            WHERE wallet_id = $1 AND currency = $2 RETURNING amount::text`,
          [leg.walletId, leg.currency, leg.delta.toString()],
        ),
      );
      const after = BigInt(updated[0]!.amount);
      await manager.query(
        `INSERT INTO ledger_entries (transaction_id, wallet_id, currency, amount, balance_after) VALUES ($1, $2, $3, $4, $5)`,
        [
          transaction.id,
          leg.walletId,
          leg.currency,
          leg.delta.toString(),
          after.toString(),
        ],
      );
      balancesAfter.push({
        walletId: leg.walletId,
        currency: leg.currency,
        amount: after,
      });
    }
    return { transaction, balancesAfter };
  }

  // Rows are locked in one fixed order, so two opposite transfers can never deadlock each other.
  private async lock(
    manager: EntityManager,
    legs: Leg[],
  ): Promise<Map<string, bigint>> {
    const keys = [...new Map(legs.map((l) => [legKey(l), l])).values()].sort(
      (a, b) => (legKey(a) < legKey(b) ? -1 : legKey(a) > legKey(b) ? 1 : 0),
    );
    const held = new Map<string, bigint>();
    for (const key of keys) {
      const rows = await manager.query<{ amount: string }[]>(
        'SELECT amount::text FROM balances WHERE wallet_id = $1 AND currency = $2 FOR UPDATE',
        [key.walletId, key.currency],
      );
      if (!rows[0])
        throw new AppError('WALLET_NOT_FOUND', 'No wallet with this ID.');
      held.set(legKey(key), BigInt(rows[0].amount));
    }
    return held;
  }
}
