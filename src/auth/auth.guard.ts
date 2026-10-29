import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import { ACCESS, type Access } from './access.decorators.js';
import { AccessTokens } from './access-tokens.js';
import type { AuthenticatedRequest, Principal } from './principal.js';
import { sameHash, sha256 } from './secrets.js';
import { parseWalletKey } from './wallet-key-format.js';

const NOT_SIGNED_IN = 'Sign in, or send a wallet key, to use this route.';

// Runs on every route after the rate limit, and lets a request through only with a live session or key.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokens,
    private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access =
      this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'any';
    if (access === 'public') return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bearer = req.headers.authorization;
    const walletKey = req.headers['x-wallet-key'];
    if (bearer && walletKey) {
      throw new AppError(
        'VALIDATION_FAILED',
        'Send either a bearer token or a wallet key, not both.',
      );
    }

    let principal: Principal;
    if (bearer) {
      principal = await this.fromBearer(bearer);
    } else if (typeof walletKey === 'string') {
      principal = await this.fromWalletKey(walletKey);
    } else {
      throw new AppError('UNAUTHENTICATED', NOT_SIGNED_IN);
    }

    if (access === 'session' && principal.via !== 'session') {
      throw new AppError(
        'SESSION_REQUIRED',
        'This route needs a signed-in session, not a wallet key.',
      );
    }
    req.principal = principal;
    return true;
  }

  private async fromBearer(header: string): Promise<Principal> {
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token)
      throw new AppError('UNAUTHENTICATED', NOT_SIGNED_IN);
    const claims = await this.tokens.verify(token);
    if (!claims)
      throw new AppError(
        'UNAUTHENTICATED',
        'This token is not valid or has expired.',
      );

    const rows = await this.db.query<
      { revoked_at: Date | null; wallet_id: string }[]
    >(
      `SELECT s.revoked_at, w.id AS wallet_id
         FROM sessions s JOIN wallets w ON w.account_id = s.account_id
        WHERE s.id = $1 AND s.account_id = $2 AND s.expires_at > now()`,
      [claims.sessionId, claims.accountId],
    );
    const row = rows[0];
    if (!row || row.revoked_at)
      throw new AppError(
        'SESSION_REVOKED',
        'This session has ended. Log in again.',
      );
    return {
      accountId: claims.accountId,
      walletId: row.wallet_id,
      via: 'session',
      sessionId: claims.sessionId,
      walletKeyId: null,
    };
  }

  private async fromWalletKey(key: string): Promise<Principal> {
    const parsed = parseWalletKey(key);
    if (!parsed)
      throw new AppError('UNAUTHENTICATED', 'This wallet key is not valid.');
    const rows = await this.db.query<
      {
        wallet_id: string;
        account_id: string;
        secret_hash: Buffer;
        revoked_at: Date | null;
        stale: boolean;
      }[]
    >(
      `SELECT k.wallet_id, w.account_id, k.secret_hash, k.revoked_at,
              (k.last_used_at IS NULL OR k.last_used_at < now() - interval '1 minute') AS stale
         FROM wallet_keys k JOIN wallets w ON w.id = k.wallet_id
        WHERE k.id = $1`,
      [parsed.keyId],
    );
    const row = rows[0];
    if (
      !row ||
      row.revoked_at ||
      !sameHash(row.secret_hash, sha256(parsed.secret))
    ) {
      throw new AppError('UNAUTHENTICATED', 'This wallet key is not valid.');
    }
    // Writing last-used at most once a minute keeps busy scripts from turning reads into writes.
    if (row.stale)
      await this.db.query(
        'UPDATE wallet_keys SET last_used_at = now() WHERE id = $1',
        [parsed.keyId],
      );
    return {
      accountId: row.account_id,
      walletId: row.wallet_id,
      via: 'walletKey',
      sessionId: null,
      walletKeyId: parsed.keyId,
    };
  }
}
