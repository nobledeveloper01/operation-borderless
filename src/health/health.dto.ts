import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({ enum: ['ok', 'unavailable'], example: 'ok' })
  status: 'ok' | 'unavailable';
}
