import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Caller, type Principal } from '../auth/principal.js';
import { parseAmount } from '../../common/money/amount.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { CreateQuoteDto, QuoteDto } from './dto.js';
import { QuotesService } from './quotes.service.js';

@ApiTags('FX')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Get a price that holds for 30 seconds',
    description:
      'Shows the fee and exactly what will arrive. Pass quoteId on a swap or transfer to get this price; nothing moves and no money is reserved.',
    message: 'Quote created',
    status: HttpStatus.CREATED,
    type: QuoteDto,
    rateLimit: 'money',
    errors: [
      HttpStatus.BAD_REQUEST,
      HttpStatus.UNPROCESSABLE_ENTITY,
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
  })
  create(
    @Caller() caller: Principal,
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteDto> {
    return this.quotes.create(caller.accountId, {
      from: dto.fromCurrency,
      to: dto.toCurrency,
      amount: parseAmount(dto.amount),
    });
  }
}
