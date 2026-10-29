import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import { EnvironmentVariables } from '../config/env.validation.js';
import { FieldCipher } from '../crypto/field-cipher.js';
import { STABLECOINS } from '../currencies/currency.js';
import { Account } from './entities.js';

const UNIQUE_VIOLATION = '23505';

export interface Identifiers {
  email?: string;
  phoneNumber?: string;
}

export interface Profile {
  email: string | null;
  phoneNumber: string | null;
}

// The encryption context ties each ciphertext to its own account and field.
const context = (accountId: string, field: 'email' | 'phone') =>
  `${accountId}:${field}`;

@Injectable()
export class AccountsService {
  constructor(
    private readonly db: DataSource,
    private readonly cipher: FieldCipher,
    private readonly config: EnvironmentVariables,
  ) {}

  // Creates the account, its wallet and its five zero balances, then lets the caller add more in the same transaction.
  async createWithWallet<T>(
    ids: Identifiers,
    passwordHash: string,
    then: (
      manager: EntityManager,
      accountId: string,
      walletId: string,
    ) => Promise<T>,
  ): Promise<{
    accountId: string;
    walletId: string;
    createdAt: Date;
    result: T;
  }> {
    const accountId = randomUUID();
    try {
      return await this.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO accounts (id, email_encrypted, email_lookup, phone_encrypted, phone_lookup, pii_key_version, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            accountId,
            ids.email
              ? this.cipher.encrypt(ids.email, context(accountId, 'email'))
              : null,
            ids.email ? this.cipher.lookup(ids.email) : null,
            ids.phoneNumber
              ? this.cipher.encrypt(
                  ids.phoneNumber,
                  context(accountId, 'phone'),
                )
              : null,
            ids.phoneNumber ? this.cipher.lookup(ids.phoneNumber) : null,
            this.cipher.activeVersion,
            passwordHash,
          ],
        );
        const wallets = await manager.query<{ id: string; created_at: Date }[]>(
          'INSERT INTO wallets (account_id) VALUES ($1) RETURNING id, created_at',
          [accountId],
        );
        const wallet = wallets[0]!;
        await manager.query(
          'INSERT INTO balances (wallet_id, currency) SELECT $1, unnest($2::text[])',
          [wallet.id, [...STABLECOINS]],
        );
        const result = await then(manager, accountId, wallet.id);
        return {
          accountId,
          walletId: wallet.id,
          createdAt: wallet.created_at,
          result,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new AppError(
          'WALLET_ALREADY_EXISTS',
          'This email or phone number already has a wallet.',
        );
      }
      throw error;
    }
  }

  async findByIdentifier(ids: Identifiers): Promise<Account | null> {
    const repo = this.db.getRepository(Account);
    if (ids.email)
      return repo.findOneBy({ emailLookup: this.cipher.lookup(ids.email) });
    if (ids.phoneNumber)
      return repo.findOneBy({
        phoneLookup: this.cipher.lookup(ids.phoneNumber),
      });
    return null;
  }

  async profile(accountId: string): Promise<Profile> {
    const account = await this.db
      .getRepository(Account)
      .findOneByOrFail({ id: accountId });
    return {
      email: account.emailEncrypted
        ? this.cipher.decrypt(
            account.emailEncrypted,
            context(accountId, 'email'),
          )
        : null,
      phoneNumber: account.phoneEncrypted
        ? this.cipher.decrypt(
            account.phoneEncrypted,
            context(accountId, 'phone'),
          )
        : null,
    };
  }

  // Counts a wrong password in one statement, locking the account once the limit is reached.
  async recordFailedLogin(accountId: string): Promise<void> {
    await this.db.query(
      `UPDATE accounts
          SET failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
              locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
        WHERE id = $1`,
      [
        accountId,
        this.config.LOGIN_MAX_FAILURES,
        this.config.LOGIN_LOCK_MINUTES,
      ],
    );
  }

  async clearFailedLogins(accountId: string): Promise<void> {
    await this.db.query(
      'UPDATE accounts SET failed_logins = 0, locked_until = NULL WHERE id = $1 AND (failed_logins > 0 OR locked_until IS NOT NULL)',
      [accountId],
    );
  }
}
