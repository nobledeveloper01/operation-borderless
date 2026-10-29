import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AppError } from '../common/errors/app-error.js';
import { ApiEndpoint } from '../common/responses/api-endpoint.decorator.js';
import { HealthDto } from './health.dto.js';

// Load balancers poll these often, so they skip the rate limit.
@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiEndpoint({
    summary: 'Is the process up?',
    access: 'public',
    message: 'The API is up',
    type: HealthDto,
  })
  live(): HealthDto {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiEndpoint({
    summary: 'Can the API serve traffic?',
    access: 'public',
    message: 'The API is ready',
    type: HealthDto,
    errors: [HttpStatus.SERVICE_UNAVAILABLE],
  })
  async ready(): Promise<HealthDto> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new AppError('NOT_READY', 'The database is not answering.');
    }
    return { status: 'ok' };
  }
}
