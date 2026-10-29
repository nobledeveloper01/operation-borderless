import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { IdParam } from '../../common/validation/id-param.js';
import { HistoryPageDto, HistoryQueryDto } from './history.dto.js';
import { TransactionDto } from './transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('Transactions')
@Controller()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get('wallets/:walletId/transactions')
  @ApiEndpoint({
    summary: 'List your transactions, newest first',
    description:
      'Deposits, swaps, and transfers sent and received, filtered by type and currency.',
    message: 'Transactions found',
    type: HistoryPageDto,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  history(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Query() query: HistoryQueryDto,
  ): Promise<HistoryPageDto> {
    assertOwnsWallet(caller, walletId);
    return this.transactions.history(walletId, query);
  }

  @Get('transactions/:transactionId')
  @ApiEndpoint({
    summary: 'Get one of your transactions',
    description:
      'Visible to the wallet that sent it and the wallet that received it.',
    message: 'Transaction found',
    type: TransactionDto,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  get(
    @Caller() caller: Principal,
    @IdParam('transactionId') transactionId: string,
  ): Promise<TransactionDto> {
    return this.transactions.get(transactionId, caller.walletId);
  }
}
