import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto<T> {
  @ApiProperty({ example: true })
  success: true;

  @ApiProperty({ example: 200 })
  statusCode: number;

  @ApiProperty({ example: 'Request completed' })
  message: string;

  data: T;

  @ApiProperty({ example: '0192f5c2-7b1e-7c40-9d1a-2f6b8f0c9e11' })
  requestId: string;

  @ApiProperty({ example: '2026-10-29T10:00:00.000Z' })
  timestamp: string;
}
