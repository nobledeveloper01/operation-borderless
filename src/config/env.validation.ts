import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

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

  @Transform(toInt)
  @IsInt()
  @Min(1)
  RATE_LIMIT_PER_MINUTE = 120;

  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  TRUST_PROXY = false;
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
  if (problems.length > 0) {
    throw new Error(`Invalid environment: ${problems.join('; ')}`);
  }
  return env;
}
