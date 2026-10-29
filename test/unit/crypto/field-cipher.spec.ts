import { randomBytes } from 'node:crypto';
import {
  FieldCipher,
  parseEncryptionKeys,
} from '../../../src/crypto/field-cipher.js';

const key1 = randomBytes(32);
const key2 = randomBytes(32);
const lookup = randomBytes(32);

function cipher(activeVersion: number, versions: Record<number, Buffer>) {
  return new FieldCipher({
    encryption: new Map(
      Object.entries(versions).map(([v, k]) => [Number(v), k]),
    ),
    activeVersion,
    lookup,
  });
}

describe('FieldCipher', () => {
  const c = cipher(1, { 1: key1 });

  it('round-trips a value and never stores it in the clear', () => {
    const sealed = c.encrypt('ada@example.com', 'account-1:email');
    expect(sealed.includes(Buffer.from('ada@example.com'))).toBe(false);
    expect(c.decrypt(sealed, 'account-1:email')).toBe('ada@example.com');
  });

  it('uses a fresh IV every time', () => {
    expect(c.encrypt('same', 'ctx').equals(c.encrypt('same', 'ctx'))).toBe(
      false,
    );
  });

  it('TC-063 refuses a value moved to another account or field', () => {
    const sealed = c.encrypt('ada@example.com', 'account-1:email');
    expect(() => c.decrypt(sealed, 'account-2:email')).toThrow();
    expect(() => c.decrypt(sealed, 'account-1:phone')).toThrow();
  });

  it('TC-063 refuses a tampered value', () => {
    const sealed = c.encrypt('ada@example.com', 'ctx');
    const last = sealed.length - 1;
    sealed[last] = (sealed[last] ?? 0) ^ 1;
    expect(() => c.decrypt(sealed, 'ctx')).toThrow();
  });

  it('TC-063 still reads old values after the active key changes', () => {
    const old = c.encrypt('+2348012345678', 'ctx');
    const rotated = cipher(2, { 1: key1, 2: key2 });
    expect(rotated.decrypt(old, 'ctx')).toBe('+2348012345678');
    expect(rotated.encrypt('x', 'ctx').readUInt8(0)).toBe(2);
  });

  it('gives the same lookup hash for the same value only', () => {
    expect(
      c.lookup('ada@example.com').equals(c.lookup('ada@example.com')),
    ).toBe(true);
    expect(
      c.lookup('ada@example.com').equals(c.lookup('bob@example.com')),
    ).toBe(false);
    expect(c.lookup('x')).toHaveLength(32);
  });

  it('parses versioned keys and refuses bad ones', () => {
    const b64 = key1.toString('base64');
    expect(
      parseEncryptionKeys(`1:${b64}, 2:${key2.toString('base64')}`).size,
    ).toBe(2);
    expect(() => parseEncryptionKeys(`1:${b64},1:${b64}`)).toThrow(/twice/);
    expect(() => parseEncryptionKeys(`0:${b64}`)).toThrow(/version/);
    expect(() => parseEncryptionKeys('')).toThrow(/required/);
    expect(() => cipher(3, { 1: key1 })).toThrow(/active version 3/);
  });
});
