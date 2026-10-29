import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const toInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d{1,3}$/.test(value) ? Number(value) : value;

export class NotificationsQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(toInteger)
  @Min(1, { message: 'limit must be at least 1.' })
  @Max(100, { message: 'limit must be at most 100.' })
  @IsInt({ message: 'limit must be a whole number.' })
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Only notices not yet marked read.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'unread must be true or false.' })
  unread?: boolean;
}

export class NotificationDto {
  @ApiProperty()
  notificationId: string;

  @ApiProperty({ example: 'transfer.received' })
  kind: string;

  @ApiProperty({ example: 'Money received' })
  title: string;

  @ApiProperty({ example: 'You received 289.542910 cGHS.' })
  body: string;

  @ApiProperty({ example: '2026-10-29T14:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ nullable: true, type: String })
  readAt: string | null;
}
