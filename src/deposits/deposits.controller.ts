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
import { DepositsService } from './deposits.service.js';
import { CreateDepositDto } from './dto.js';

@ApiTags('Deposits')
@Controller('wallets/:walletId/deposits')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Deposit a stablecoin into your wallet (simulated)',
    message: 'Deposit completed',
    status: HttpStatus.CREATED,
    type: MovementResultDto,
    idempotent: true,
    rateLimit: 'money',
    errors: [HttpStatus.NOT_FOUND],
  })
  async create(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Body() dto: CreateDepositDto,
    @Idempotency() request: IdempotencyRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MovementResultDto> {
    assertOwnsWallet(caller, walletId);
    return sendMovement(
      res,
      await this.deposits.deposit(caller.accountId, walletId, dto, request),
    );
  }
}
