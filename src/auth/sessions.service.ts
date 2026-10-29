import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { EnvironmentVariables } from '../config/env.validation.js';
import { AppError } from '../common/errors/app-error.js';
import { AccessTokens } from './access-tokens.js';
import type { SessionTokensDto } from './dto.js';
import { randomToken, sha256 } from './secrets.js';

type RevokeReason = 'LOGOUT' | 'LOGOUT_ALL' | 'REFRESH_REUSE';

interface RefreshRow {
  id: string;
  session_id: string;
  account_id: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

const REFRESH_REFUSED = 'This refresh token is not valid. Log in again.';

@Injectable()
export class SessionsService {
  constructor(
    private readonly db: DataSource,
    private readonly tokens: AccessTokens,
    private readonly config: EnvironmentVariables,
  ) {}

  // Opens a session inside the caller's transaction, so a new wallet and its first login commit together.
  async start(
    manager: EntityManager,
    accountId: string,
  ): Promise<SessionTokensDto> {
    const rows = await manager.query<{ id: string }[]>(
      'INSERT INTO sessions (account_id) VALUES ($1) RETURNING id',
      [accountId],
    );
    const sessionId = rows[0]!.id;
    return this.issuePair(manager, accountId, sessionId);
  }

  // Swaps a refresh token for a new pair; a token used twice means it leaked, so the whole session ends.
  async rotate(refreshToken: string): Promise<SessionTokensDto> {
    const outcome = await this.db.transaction(async (manager) => {
      const rows = await manager.query<RefreshRow[]>(
        `SELECT rt.id, rt.session_id, s.account_id, rt.expires_at, rt.used_at, s.revoked_at
           FROM refresh_tokens rt JOIN sessions s ON s.id = rt.session_id
          WHERE rt.token_hash = $1
          FOR UPDATE OF rt, s`,
        [sha256(refreshToken)],
      );
      const row = rows[0];
      if (!row || row.revoked_at || row.expires_at <= new Date())
        return { refused: true as const };
      if (row.used_at) {
        await this.revokeWith(
          manager,
          'id = $1',
          [row.session_id],
          'REFRESH_REUSE',
        );
        return { refused: true as const };
      }
      await manager.query(
        'UPDATE refresh_tokens SET used_at = now() WHERE id = $1',
        [row.id],
      );
      return {
        refused: false as const,
        pair: await this.issuePair(manager, row.account_id, row.session_id),
      };
    });
    if (outcome.refused) throw new AppError('UNAUTHENTICATED', REFRESH_REFUSED);
    return outcome.pair;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.revokeWith(this.db.manager, 'id = $1', [sessionId], 'LOGOUT');
  }

  async revokeAll(accountId: string): Promise<void> {
    await this.revokeWith(
      this.db.manager,
      'account_id = $1',
      [accountId],
      'LOGOUT_ALL',
    );
  }

  private async revokeWith(
    manager: EntityManager,
    where: string,
    params: unknown[],
    reason: RevokeReason,
  ) {
    await manager.query(
      `UPDATE sessions SET revoked_at = now(), revoked_reason = $${params.length + 1} WHERE ${where} AND revoked_at IS NULL`,
      [...params, reason],
    );
  }

  private async issuePair(
    manager: EntityManager,
    accountId: string,
    sessionId: string,
  ): Promise<SessionTokensDto> {
    const refreshToken = randomToken(32);
    const refreshExpiresAt = new Date(
      Date.now() + this.config.REFRESH_TOKEN_DAYS * 86_400_000,
    );
    await manager.query(
      'INSERT INTO refresh_tokens (session_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [sessionId, sha256(refreshToken), refreshExpiresAt],
    );
    const access = await this.tokens.issue({ accountId, sessionId });
    return {
      tokenType: 'Bearer',
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
