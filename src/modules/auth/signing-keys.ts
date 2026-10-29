import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SigningKeys {
  activeKid: string;
  privateKey: KeyObject;
  publicKeys: Map<string, KeyObject>;
}

const PEM = /^([A-Za-z0-9_-]{1,40})\.pem$/;

// Loads every <kid>.pem in the folder; outside production a missing active key is created on first start.
export function loadSigningKeys(
  dir: string,
  activeKid: string,
  allowCreate: boolean,
): SigningKeys {
  const activePath = join(dir, `${activeKid}.pem`);
  if (!existsSync(activePath)) {
    if (!allowCreate) throw new Error(`No signing key at ${activePath}`);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(
      activePath,
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
      { mode: 0o600 },
    );
  }

  const publicKeys = new Map<string, KeyObject>();
  let privateKey: KeyObject | undefined;
  for (const file of readdirSync(dir)) {
    const kid = PEM.exec(file)?.[1];
    if (!kid) continue;
    const key = createPrivateKey(readFileSync(join(dir, file), 'utf8'));
    if (
      key.asymmetricKeyType !== 'ec' ||
      key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      throw new Error(`Signing key ${file} must be an EC P-256 key`);
    }
    publicKeys.set(kid, createPublicKey(key));
    if (kid === activeKid) privateKey = key;
  }
  if (!privateKey) throw new Error(`No signing key for ${activeKid}`);
  return { activeKid, privateKey, publicKeys };
}
