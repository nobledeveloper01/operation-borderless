import { formatAmount } from '../common/money/amount.js';
import type { TransactionDto, TransactionRow } from './transaction.dto.js';

// Every place that returns a transaction goes through here, so amounts and dates always look the same.
export function toTransactionDto(row: TransactionRow): TransactionDto {
  return {
    transactionId: row.id,
    type: row.type,
    status: row.status,
    fromWalletId: row.from_wallet_id,
    toWalletId: row.to_wallet_id,
    fromCurrency: row.from_currency,
    fromAmount:
      row.from_amount === null ? null : formatAmount(BigInt(row.from_amount)),
    toCurrency: row.to_currency,
    toAmount: formatAmount(BigInt(row.to_amount)),
    rate: row.rate,
    rateSource: row.rate_source,
    rateAsOf: row.rate_as_of?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

export const TRANSACTION_COLUMNS = `id, type, status, from_wallet_id, to_wallet_id, from_currency, from_amount::text,
  to_currency, to_amount::text, rate::text, rate_source, rate_as_of, created_at`;
