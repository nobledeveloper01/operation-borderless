import { Inject, Injectable } from '@nestjs/common';
import { errors, jwtVerify, SignJWT } from 'jose';
import { EnvironmentVariables } from '../config/env.validation.js';
import { loadSigningKeys, type SigningKeys } from './signing-keys.js';

export interface AccessClaims {
  accountId: string;
  sessionId: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
}

// Signs short-lived ES256 tokens and checks them against every trusted key, so keys can rotate.
@Injectable()
export class AccessTokens {
  private readonly keys: SigningKeys;

  constructor(
    @Inject(EnvironmentVariables) private readonly config: EnvironmentVariables,
  ) {
    this.keys = loadSigningKeys(
      config.JWT_KEYS_DIR,
      config.JWT_ACTIVE_KID,
      config.NODE_ENV !== 'production',
    );
  }

  async issue(
    claims: AccessClaims,
    now = new Date(),
  ): Promise<IssuedAccessToken> {
    const expiresAt = new Date(
      now.getTime() + this.config.JWT_ACCESS_MINUTES * 60_000,
    );
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({
        alg: 'ES256',
        kid: this.keys.activeKid,
        typ: 'JWT',
      })
      .setSubject(claims.accountId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.keys.privateKey);
    return { token, expiresAt };
  }

  // Returns undefined for anything that isn't a valid, unexpired token of ours.
  async verify(token: string): Promise<AccessClaims | undefined> {
    try {
      const { payload } = await jwtVerify(
        token,
        (header) => {
          const key = header.kid
            ? this.keys.publicKeys.get(header.kid)
            : undefined;
          if (!key) throw new errors.JWKSNoMatchingKey();
          return key;
        },
        {
          algorithms: ['ES256'],
          issuer: this.config.JWT_ISSUER,
          audience: this.config.JWT_AUDIENCE,
        },
      );
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        return undefined;
      return { accountId: payload.sub, sessionId: payload.sid };
    } catch {
      return undefined;
    }
  }
}
