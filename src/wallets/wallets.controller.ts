import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { CreateWalletDto } from '../auth/dto.js';
import { ApiEndpoint } from '../common/responses/api-endpoint.decorator.js';
import { IdParam } from '../common/validation/id-param.js';
import { CreatedWalletDto, WalletBalancesDto, WalletDto } from './dto.js';
import { WalletsService } from './wallets.service.js';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  @ApiEndpoint({
    summary: 'Create a wallet with an email or phone number',
    description:
      'Creates the account, the wallet and a zero balance for each stablecoin, and signs the holder in.',
    message: 'Wallet created',
    status: HttpStatus.CREATED,
    type: CreatedWalletDto,
    access: 'public',
    authRateLimit: true,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT],
  })
  create(@Body() dto: CreateWalletDto): Promise<CreatedWalletDto> {
    return this.wallets.create(
      { email: dto.email, phoneNumber: dto.phoneNumber },
      dto.password,
    );
  }

  @Get(':walletId')
  @ApiEndpoint({
    summary: 'Get your wallet and its balances',
    message: 'Wallet found',
    type: WalletDto,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  get(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
  ): Promise<WalletDto> {
    assertOwnsWallet(caller, walletId);
    return this.wallets.get(walletId, caller.accountId);
  }

  @Get(':walletId/balances')
  @ApiEndpoint({
    summary: 'Get your balances',
    message: 'Balances found',
    type: WalletBalancesDto,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  async balances(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
  ): Promise<WalletBalancesDto> {
    assertOwnsWallet(caller, walletId);
    return { walletId, balances: await this.wallets.balances(walletId) };
  }
}
