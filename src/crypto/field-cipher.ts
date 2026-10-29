import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES;

export interface FieldCipherKeys {
  encryption: Map<number, Buffer>;
  activeVersion: number;
  lookup: Buffer;
}

// Reads "1:base64,2:base64" into versioned 32-byte keys, refusing anything malformed.
export function parseEncryptionKeys(text: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const part of text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [versionText, encoded] = part.split(':');
    const version = Number(versionText);
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      version > 255 ||
      !encoded
    ) {
      throw new Error(
        'Each encryption key must look like <version 1-255>:<base64 key>',
      );
    }
    if (keys.has(version))
      throw new Error(`Encryption key version ${version} is listed twice`);
    keys.set(version, decodeKey(encoded, `encryption key ${version}`));
  }
  if (keys.size === 0)
    throw new Error('At least one encryption key is required');
  return keys;
}

export function decodeKey(encoded: string, label: string): Buffer {
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_BYTES)
    throw new Error(`The ${label} must be ${KEY_BYTES} bytes of base64`);
  return key;
}

// Encrypts personal fields so a leaked dump or backup shows nothing readable.
export class FieldCipher {
  constructor(private readonly keys: FieldCipherKeys) {
    if (!keys.encryption.has(keys.activeVersion)) {
      throw new Error(
        `No encryption key for active version ${keys.activeVersion}`,
      );
    }
  }

  get activeVersion(): number {
    return this.keys.activeVersion;
  }

  // The context (for example the account ID and field name) is bound in, so a value copied elsewhere won't decrypt.
  encrypt(plain: string, context: string): Buffer {
    const version = this.keys.activeVersion;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key(version), iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.of(version), iv, cipher.getAuthTag(), body]);
  }

  decrypt(sealed: Buffer, context: string): string {
    if (sealed.length < HEADER_BYTES)
      throw new Error('Encrypted value is too short');
    const version = sealed.readUInt8(0);
    const iv = sealed.subarray(1, 1 + IV_BYTES);
    const tag = sealed.subarray(1 + IV_BYTES, HEADER_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', this.key(version), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(sealed.subarray(HEADER_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  // A keyed hash lets the database enforce "one wallet per email" without storing the email in the clear.
  lookup(normalised: string): Buffer {
    return createHmac('sha256', this.keys.lookup)
      .update(normalised, 'utf8')
      .digest();
  }

  private key(version: number): Buffer {
    const key = this.keys.encryption.get(version);
    if (!key) throw new Error(`No encryption key for version ${version}`);
    return key;
  }
}
