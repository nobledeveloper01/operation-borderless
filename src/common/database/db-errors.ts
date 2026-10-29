// Postgres error codes the API reacts to.
export const PG = {
  deadlock: '40P01',
  serialization: '40001',
  lockTimeout: '55P03',
  statementTimeout: '57014',
  outOfRange: '22003',
} as const;

export function pgCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

// Postgres already rolled the transaction back, so running it again from the start is safe.
export function isTransientConflict(error: unknown): boolean {
  const code = pgCode(error);
  return code === PG.deadlock || code === PG.serialization;
}
