import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { returned } from '../database/returned.js';
import { WalletKey } from '../accounts/entities.js';
import { sha256 } from '../auth/secrets.js';
import { newWalletKey } from '../auth/wallet-key-format.js';
import { AppError } from '../common/errors/app-error.js';
import type { CreatedWalletKeyDto, WalletKeyDto } from './dto.js';

export const MAX_ACTIVE_KEYS = 5;

const toDto = (key: WalletKey): WalletKeyDto => ({
  keyId: key.id,
  name: key.name,
  createdAt: key.createdAt.toISOString(),
  lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
});

@Injectable()
export class WalletKeysService {
  constructor(private readonly db: DataSource) {}

  // The wallet row is locked first, so two requests at once can't both squeeze past the five-key limit.
  async create(walletId: string, name: string): Promise<CreatedWalletKeyDto> {
    const { keyId, secret, key } = newWalletKey();
    const saved = await this.db.transaction(async (manager) => {
      await manager.query('SELECT 1 FROM wallets WHERE id = $1 FOR UPDATE', [
        walletId,
      ]);
      const live = await manager.query<{ n: string }[]>(
        'SELECT count(*) AS n FROM wallet_keys WHERE wallet_id = $1 AND revoked_at IS NULL',
        [walletId],
      );
      if (Number(live[0]?.n) >= MAX_ACTIVE_KEYS) {
        throw new AppError(
          'TOO_MANY_KEYS',
          `A wallet can have at most ${MAX_ACTIVE_KEYS} active keys. Revoke one first.`,
        );
      }
      return manager.save(
        WalletKey,
        manager.create(WalletKey, {
          id: keyId,
          walletId,
          name,
          secretHash: sha256(secret),
        }),
      );
    });
    return { ...toDto(saved), key };
  }

  async list(walletId: string): Promise<WalletKeyDto[]> {
    const keys = await this.db.getRepository(WalletKey).find({
      where: { walletId, revokedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    return keys.map(toDto);
  }

  async revoke(walletId: string, keyId: string): Promise<void> {
    const rows = returned<{ id: string }>(
      await this.db.query(
        'UPDATE wallet_keys SET revoked_at = now() WHERE id = $1 AND wallet_id = $2 AND revoked_at IS NULL RETURNING id',
        [keyId, walletId],
      ),
    );
    if (rows.length === 0)
      throw new AppError(
        'KEY_NOT_FOUND',
        'No active key with this ID on this wallet.',
      );
  }
}
