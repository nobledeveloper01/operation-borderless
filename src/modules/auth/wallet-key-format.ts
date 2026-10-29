import { randomBytes } from 'node:crypto';
import { randomToken } from './secrets.js';

const KEY = /^bwk_(k_[a-z0-9]{12})_([A-Za-z0-9_-]{43})$/;
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newWalletKey(): { keyId: string; secret: string; key: string } {
  const keyId = `k_${[...randomBytes(12)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')}`;
  const secret = randomToken(32);
  return { keyId, secret, key: `bwk_${keyId}_${secret}` };
}

export function parseWalletKey(
  key: string,
): { keyId: string; secret: string } | undefined {
  const match = KEY.exec(key);
  return match?.[1] && match[2]
    ? { keyId: match[1], secret: match[2] }
    : undefined;
}
