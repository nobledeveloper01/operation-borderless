import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'VALIDATION_FAILED' })
  code: string;

  @ApiProperty({
    example: 'amount must be a decimal string with at most 6 decimal places',
  })
  message: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  details?: Record<string, unknown>;

  @ApiProperty({ example: '0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11' })
  requestId: string;

  @ApiProperty({ example: '/api/v1/wallets' })
  path: string;

  @ApiProperty({ example: '2026-10-29T10:00:00.000Z' })
  timestamp: string;
}
