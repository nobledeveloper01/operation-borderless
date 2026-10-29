import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppError } from '../../common/errors/app-error.js';
import { formatRate } from '../../common/money/rate.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { STABLECOINS } from '../../common/currencies/currency.js';
import { ATTRIBUTION, RatesDto } from './dto.js';
import { FxService } from './fx.service.js';

@ApiTags('FX rates')
@Controller('fx')
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rates')
  @ApiEndpoint({
    summary: 'Current rates between every pair of stablecoins',
    description:
      'Daily reference rates, not market prices. Stale rates are still shown, marked isStale, but cannot price money.',
    message: 'Rates found',
    type: RatesDto,
    access: 'public',
    errors: [HttpStatus.SERVICE_UNAVAILABLE],
  })
  rates(): RatesDto {
    const snapshot = this.fx.latest();
    if (!snapshot)
      throw new AppError(
        'FX_RATE_UNAVAILABLE',
        'No exchange rates have been fetched yet. Try again shortly.',
      );
    const fresh = this.fx.isFresh(snapshot);
    // Stale rates are listed from the snapshot itself, since quote() refuses to price with them.
    const pairs = STABLECOINS.flatMap((from) =>
      STABLECOINS.filter((to) => to !== from).map((to) => ({
        from,
        to,
        rate: formatRate(this.fx.crossFrom(snapshot, from, to)),
        refreshedAt: snapshot.providerUpdatedAt.toISOString(),
      })),
    );
    return {
      base: 'USDx',
      source: snapshot.source,
      isStale: !fresh,
      providerUpdatedAt: snapshot.providerUpdatedAt.toISOString(),
      fetchedAt: snapshot.fetchedAt.toISOString(),
      pairs,
      attribution: ATTRIBUTION,
    };
  }
}
