import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import {
  Idempotency,
  type IdempotencyRequest,
} from '../idempotency/idempotency-key.decorator.js';
import {
  MovementResultDto,
  sendMovement,
} from '../transactions/movement-result.dto.js';
import { CreateTransferDto } from './dto.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('Transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Send money from your wallet to another wallet',
    description:
      'When the currencies differ the amount is converted at the current rate, rounded down.',
    message: 'Transfer completed',
    status: HttpStatus.CREATED,
    type: MovementResultDto,
    idempotent: true,
    rateLimit: 'money',
    errors: [HttpStatus.NOT_FOUND, HttpStatus.SERVICE_UNAVAILABLE],
  })
  async create(
    @Caller() caller: Principal,
    @Body() dto: CreateTransferDto,
    @Idempotency() request: IdempotencyRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MovementResultDto> {
    assertOwnsWallet(caller, dto.fromWalletId);
    return sendMovement(
      res,
      await this.transfers.transfer(caller.accountId, dto, request),
    );
  }
}
