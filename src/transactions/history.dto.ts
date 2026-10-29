import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { STABLECOINS, type Stablecoin } from '../currencies/currency.js';
import { TransactionDto, type TransactionType } from './transaction.dto.js';

export const TRANSACTION_TYPES = ['DEPOSIT', 'SWAP', 'TRANSFER'] as const;
export const MAX_PAGE = 10_000;
export const MAX_LIMIT = 100;

export type Direction = 'IN' | 'OUT' | 'INTERNAL';

// Only plain digits become numbers, so "1.5" or "abc" still fail the integer check.
const toInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d{1,6}$/.test(value) ? Number(value) : value;

// "SWAP,TRANSFER" and repeated parameters both become one list.
const toList = ({ value }: { value: unknown }): unknown =>
  (Array.isArray(value) ? value : [value]).flatMap((v: unknown) =>
    typeof v === 'string' ? v.split(',') : [v],
  );

export class HistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAGE })
  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'page must be a whole number.' })
  @Min(1, { message: 'page must be at least 1.' })
  @Max(MAX_PAGE, { message: `page must be at most ${MAX_PAGE}.` })
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_LIMIT })
  @IsOptional()
  @Transform(toInteger)
  @IsInt({ message: 'limit must be a whole number.' })
  @Min(1, { message: 'limit must be at least 1.' })
  @Max(MAX_LIMIT, { message: `limit must be at most ${MAX_LIMIT}.` })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'One or more of DEPOSIT, SWAP, TRANSFER, comma separated.',
    example: 'SWAP,TRANSFER',
  })
  @IsOptional()
  @Transform(toList)
  @IsIn(TRANSACTION_TYPES, {
    each: true,
    message: `type must be one or more of ${TRANSACTION_TYPES.join(', ')}.`,
  })
  type?: TransactionType[];

  @ApiPropertyOptional({
    description:
      'One or more stablecoins, comma separated; matches either side of the transaction.',
    example: 'cGHS',
  })
  @IsOptional()
  @Transform(toList)
  @IsIn(STABLECOINS, {
    each: true,
    message: `currency must be one or more of ${STABLECOINS.join(', ')}.`,
  })
  currency?: Stablecoin[];
}

export class HistoryItemDto extends TransactionDto {
  @ApiProperty({
    enum: ['IN', 'OUT', 'INTERNAL'],
    description:
      'IN for deposits and transfers received, OUT for transfers sent, INTERNAL for swaps.',
  })
  direction: Direction;
}

export class HistoryPageDto {
  @ApiProperty({ type: [HistoryItemDto] })
  items: HistoryItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({
    example: 3,
    description: 'Matching transactions in all pages.',
  })
  total: number;
}
