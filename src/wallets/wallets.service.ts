import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AccountsService,
  type Identifiers,
} from '../accounts/accounts.service.js';
import { Balance } from '../accounts/entities.js';
import { hashPassword } from '../auth/passwords.js';
import { SessionsService } from '../auth/sessions.service.js';
import { AppError } from '../common/errors/app-error.js';
import { formatAmount } from '../common/money/amount.js';
import { convert } from '../common/money/rate.js';
import { STABLECOINS } from '../currencies/currency.js';
import { FxService } from '../fx/fx.service.js';
import type { CreatedWalletDto, WalletDto, WalletValuationDto } from './dto.js';

@Injectable()
export class WalletsService {
  constructor(
    private readonly db: DataSource,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
    private readonly fx: FxService,
  ) {}

  // Hashing runs before the transaction, so a slow argon2 call never holds database locks.
  async create(ids: Identifiers, password: string): Promise<CreatedWalletDto> {
    const passwordHash = await hashPassword(password);
    const created = await this.accounts.createWithWallet(
      ids,
      passwordHash,
      (manager, accountId) => this.sessions.start(manager, accountId),
    );
    return {
      walletId: created.walletId,
      email: ids.email ?? null,
      phoneNumber: ids.phoneNumber ?? null,
      ...this.value(new Map()),
      createdAt: created.createdAt.toISOString(),
      session: created.result,
    };
  }

  async get(walletId: string, accountId: string): Promise<WalletDto> {
    const [wallet, profile, valuation] = await Promise.all([
      this.db.query<{ created_at: Date }[]>(
        'SELECT created_at FROM wallets WHERE id = $1',
        [walletId],
      ),
      this.accounts.profile(accountId),
      this.balances(walletId),
    ]);
    return {
      walletId,
      ...profile,
      ...valuation,
      createdAt: wallet[0]!.created_at.toISOString(),
    };
  }

  async balances(walletId: string): Promise<WalletValuationDto> {
    const rows = await this.db.getRepository(Balance).findBy({ walletId });
    return this.value(new Map(rows.map((row) => [row.currency, row.amount])));
  }

  // Values each balance in USDx at the current rate; with no fresh rate the balances still show, without USD values.
  private value(amounts: Map<string, bigint>): WalletValuationDto {
    const balances = STABLECOINS.map((currency) => ({
      currency,
      amount: amounts.get(currency) ?? 0n,
    }));
    try {
      const priced = balances.map((b) => ({
        ...b,
        quote: this.fx.quote(b.currency, 'USDx'),
      }));
      const usd = priced.map((b) => convert(b.amount, b.quote.rate));
      const live = priced.find((b) => b.quote.snapshotId)?.quote;
      return {
        balances: priced.map((b, i) => ({
          currency: b.currency,
          amount: formatAmount(b.amount),
          usdValue: formatAmount(usd[i]!),
        })),
        totalUsd: formatAmount(usd.reduce((sum, v) => sum + v, 0n)),
        rates: {
          source: live?.source ?? null,
          asOf: live?.asOf?.toISOString() ?? null,
          unavailableReason: null,
        },
      };
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'FX_RATE_UNAVAILABLE')
        throw error;
      return {
        balances: balances.map((b) => ({
          currency: b.currency,
          amount: formatAmount(b.amount),
          usdValue: null,
        })),
        totalUsd: null,
        rates: { source: null, asOf: null, unavailableReason: error.message },
      };
    }
  }
}
