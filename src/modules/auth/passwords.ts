import argon2 from 'argon2';

// OWASP's minimum argon2id settings: 19 MiB of memory, 2 passes, 1 lane.
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let dummyHash: Promise<string> | undefined;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Unknown accounts still pay for one hash, so response time doesn't reveal whether an email exists.
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('borderless-dummy-password');
  await verifyPassword(await dummyHash, password);
}
