import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { MetricsService } from '../../common/metrics/metrics.service.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { LedgerCheckDto } from './dto.js';
import { LedgerCheckService } from './ledger-check.service.js';

@ApiTags('Operations')
@Controller('ops')
export class OpsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly ledger: LedgerCheckService,
  ) {}

  @Get('metrics')
  @ApiEndpoint({
    summary: 'Prometheus metrics for this API process',
    description:
      'Plain text in the Prometheus format, for a scraper or a person with curl.',
    message: 'Metrics',
    access: 'ops',
    produces: 'text/plain',
  })
  async scrape(@Res() res: Response): Promise<void> {
    res.type(this.metrics.contentType).send(await this.metrics.render());
  }

  @Get('ledger-check')
  @ApiEndpoint({
    summary: 'Check that every balance equals its ledger lines',
    description:
      'Runs now; the same check also runs every hour and sets a metric.',
    message: 'Ledger checked',
    type: LedgerCheckDto,
    access: 'ops',
  })
  ledgerCheck(): Promise<LedgerCheckDto> {
    return this.ledger.check();
  }
}
