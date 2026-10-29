import { plainToInstance, Transform } from 'class-transformer';
import { decodeKey, parseEncryptionKeys } from '../crypto/field-cipher.js';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { parseFeeOverrides } from '../money/fees.js';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' || value === true;
const toInt = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : Number(value);

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @IsString()
  DB_HOST = 'localhost';

  @Transform(toInt)
  @IsInt()
  DB_PORT = 5432;

  @IsString()
  DB_NAME = 'borderless';

  @IsString()
  DB_USER = 'borderless';

  @IsString()
  @MinLength(1)
  DB_PASSWORD: string;

  @IsIn(['disable', 'require', 'verify-full'])
  DB_SSL: 'disable' | 'require' | 'verify-full' = 'disable';

  @IsOptional()
  @IsString()
  DB_SSL_CA?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  // Redis for shared rate limits and the job queues, for example redis://:password@redis:6379.
  @Matches(/^rediss?:\/\/\S+$/, {
    message: 'REDIS_URL must start with redis:// or rediss://',
  })
  REDIS_URL: string;

  // Keeps each environment's queues and rate-limit counts apart in a shared Redis.
  @Matches(/^[a-z0-9-]{1,40}$/, {
    message: 'QUEUE_PREFIX must be 1 to 40 lowercase letters, digits or dashes',
  })
  QUEUE_PREFIX = 'borderless';

  // api serves HTTP, worker runs the queues and scheduled jobs, all does both in one process.
  @IsIn(['all', 'api', 'worker'])
  APP_ROLE: 'all' | 'api' | 'worker' = 'all';

  // Operators send this as X-Ops-Token to read metrics and run the ledger check; unset hides those routes.
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(32)
  OPS_TOKEN?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_MINUTE = 120;

  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  TRUST_PROXY = false;

  @IsString()
  @MinLength(1)
  PII_ENCRYPTION_KEYS: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(255)
  PII_ACTIVE_KEY_VERSION = 1;

  @IsString()
  @MinLength(1)
  PII_LOOKUP_KEY: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  AUTH_RATE_LIMIT_PER_MINUTE = 10;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  MONEY_RATE_LIMIT_PER_MINUTE = 30;

  @IsString()
  JWT_KEYS_DIR = './keys/jwt';

  // Fee on every conversion, in basis points (50 = 0.5%); same-currency transfers and deposits are free.
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(1000)
  FEE_BPS = 50;

  // Schedules the FX refresh, ledger check and cleanups on the worker (tests turn it off and call them directly).
  @Transform(toBool)
  @IsBoolean()
  JOBS_ENABLED = true;

  // First wait before redelivering a failed event; each retry waits longer, up to five minutes.
  @Transform(toInt)
  @IsInt()
  @Min(1)
  OUTBOX_RETRY_BASE_MS = 1_000;

  // Relays due outbox events into the delivery queue every second (tests relay by hand).
  @Transform(toBool)
  @IsBoolean()
  OUTBOX_DISPATCH_ENABLED = true;

  // A debit that takes a balance from at least this many US dollars to below it raises balance.low.
  @Transform(toInt)
  @IsInt()
  @Min(0)
  LOW_BALANCE_USD = 10;

  // How long a quote holds its rate and fee.
  @Transform(toInt)
  @IsInt()
  @Min(5)
  @Max(300)
  QUOTE_TTL_SECONDS = 30;

  // One direction per entry, for example "cNGN:cGHS=25,USDx:EURx=0".
  @IsOptional()
  @IsString()
  FEE_BPS_BY_PAIR?: string;

  @Matches(/^[A-Za-z0-9_-]{1,40}$/)
  JWT_ACTIVE_KID = 'dev-1';

  @IsString()
  JWT_ISSUER = 'borderless';

  @IsString()
  JWT_AUDIENCE = 'borderless-api';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(60)
  JWT_ACCESS_MINUTES = 15;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(90)
  REFRESH_TOKEN_DAYS = 30;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  SESSION_MAX_DAYS = 90;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  LOGIN_MAX_FAILURES = 5;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  LOGIN_LOCK_MINUTES = 15;

  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  FX_PRIMARY_URL = 'https://open.er-api.com/v6/latest/USD';

  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: false })
  FX_SECONDARY_URL =
    'https://latest.currency-api.pages.dev/v1/currencies/usd.json';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(72)
  FX_MAX_DATA_AGE_HOURS = 26;

  @Transform(toInt)
  @IsInt()
  @Min(500)
  @Max(10_000)
  FX_TIMEOUT_MS = 3000;

  @Transform(toBool)
  @IsBoolean()
  FX_FIXED_TABLE = false;

  @Transform(toBool)
  @IsBoolean()
  FX_REFRESH_ENABLED = true;
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, raw, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  const problems = errors.flatMap((e) => Object.values(e.constraints ?? {}));
  if (env.NODE_ENV === 'production' && env.DB_SSL !== 'verify-full') {
    problems.push('DB_SSL must be verify-full in production');
  }
  if (env.DB_SSL === 'verify-full' && !env.DB_SSL_CA) {
    problems.push('DB_SSL_CA is required when DB_SSL is verify-full');
  }
  problems.push(...keyProblems(env));
  try {
    parseFeeOverrides(env.FEE_BPS_BY_PAIR);
  } catch (error) {
    problems.push((error as Error).message);
  }
  if (
    env.NODE_ENV === 'production' &&
    env.REDIS_URL?.includes('local-redis-password')
  ) {
    problems.push('Production cannot use the local-only Redis password');
  }
  if (env.NODE_ENV === 'production' && env.OPS_TOKEN?.startsWith('local-')) {
    problems.push('Production cannot use the local-only OPS_TOKEN');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment: ${problems.join('; ')}`);
  }
  return env;
}

// The compose file ships fixed keys for local use, and production must never start with them.
export const LOCAL_ONLY_KEY_MARK = 'bG9jYWwt';

function keyProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  try {
    const keys = parseEncryptionKeys(env.PII_ENCRYPTION_KEYS ?? '');
    if (!keys.has(env.PII_ACTIVE_KEY_VERSION)) {
      problems.push(
        `PII_ENCRYPTION_KEYS has no key for version ${env.PII_ACTIVE_KEY_VERSION}`,
      );
    }
    decodeKey(env.PII_LOOKUP_KEY ?? '', 'lookup key');
  } catch (error) {
    problems.push((error as Error).message);
  }
  const usesLocalKeys = [env.PII_ENCRYPTION_KEYS, env.PII_LOOKUP_KEY].some(
    (k) => k?.includes(LOCAL_ONLY_KEY_MARK),
  );
  if (env.NODE_ENV === 'production' && usesLocalKeys) {
    problems.push('Production cannot use the local-only encryption keys');
  }
  return problems;
}
