import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AccountsService,
  type Identifiers,
} from '../accounts/accounts.service.js';
import { Balance } from '../accounts/entities.js';
import { hashPassword } from '../auth/passwords.js';
import { SessionsService } from '../auth/sessions.service.js';
import { formatAmount } from '../common/money/amount.js';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';
import type { BalanceDto, CreatedWalletDto, WalletDto } from './dto.js';

@Injectable()
export class WalletsService {
  constructor(
    private readonly db: DataSource,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
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
      balances: STABLECOINS.map((currency) => ({
        currency,
        amount: formatAmount(0n),
      })),
      createdAt: created.createdAt.toISOString(),
      session: created.result,
    };
  }

  async get(walletId: string, accountId: string): Promise<WalletDto> {
    const [wallet, profile, balances] = await Promise.all([
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
      balances,
      createdAt: wallet[0]!.created_at.toISOString(),
    };
  }

  // Balances always come back in the same coin order, whatever order the database returns.
  async balances(walletId: string): Promise<BalanceDto[]> {
    const rows = await this.db.getRepository(Balance).findBy({ walletId });
    const byCurrency = new Map(rows.map((row) => [row.currency, row.amount]));
    return STABLECOINS.map((currency: Stablecoin) => ({
      currency,
      amount: formatAmount(byCurrency.get(currency) ?? 0n),
    }));
  }
}
