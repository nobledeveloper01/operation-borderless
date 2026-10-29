import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { ApiEndpoint } from '../common/responses/api-endpoint.decorator.js';
import { IdParam } from '../common/validation/id-param.js';
import {
  Idempotency,
  type IdempotencyRequest,
} from '../idempotency/idempotency-key.decorator.js';
import {
  MovementResultDto,
  sendMovement,
} from '../transactions/movement-result.dto.js';
import { CreateSwapDto } from './dto.js';
import { SwapsService } from './swaps.service.js';

@ApiTags('Swaps')
@Controller('wallets/:walletId/swaps')
export class SwapsController {
  constructor(private readonly swaps: SwapsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Swap one stablecoin for another inside your wallet',
    description:
      'Priced at the current rate; refused if it would overdraw the balance or if rates are stale.',
    message: 'Swap completed',
    status: HttpStatus.CREATED,
    type: MovementResultDto,
    idempotent: true,
    rateLimit: 'money',
    errors: [HttpStatus.NOT_FOUND, HttpStatus.SERVICE_UNAVAILABLE],
  })
  async create(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Body() dto: CreateSwapDto,
    @Idempotency() request: IdempotencyRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MovementResultDto> {
    assertOwnsWallet(caller, walletId);
    return sendMovement(
      res,
      await this.swaps.swap(caller.accountId, walletId, dto, request),
    );
  }
}
