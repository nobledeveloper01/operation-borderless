import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { AppError } from '../../common/errors/app-error.js';
import { RateLimited } from '../../common/http/rate-limit-groups.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { IdParam } from '../../common/validation/id-param.js';
import {
  CreatedWalletKeyDto,
  CreateWalletKeyDto,
  WalletKeyDto,
} from './dto.js';
import { WalletKeysService } from './wallet-keys.service.js';

const KEY_ID = /^k_[a-z0-9]{12}$/;

// Only a signed-in holder manages keys, so a leaked key can't mint more keys.
@ApiTags('Wallet keys')
@Controller('wallets/:walletId/keys')
export class WalletKeysController {
  constructor(private readonly keys: WalletKeysService) {}

  @Post()
  @RateLimited('auth')
  @ApiEndpoint({
    summary: 'Create a wallet key for scripts and servers',
    message: 'Wallet key created',
    status: HttpStatus.CREATED,
    type: CreatedWalletKeyDto,
    access: 'session',
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND, HttpStatus.CONFLICT],
  })
  create(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Body() dto: CreateWalletKeyDto,
  ): Promise<CreatedWalletKeyDto> {
    assertOwnsWallet(caller, walletId);
    return this.keys.create(walletId, dto.name);
  }

  @Get()
  @ApiEndpoint({
    summary: 'List active wallet keys (secrets are never shown again)',
    message: 'Wallet keys found',
    type: WalletKeyDto,
    isArray: true,
    access: 'session',
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  list(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
  ): Promise<WalletKeyDto[]> {
    assertOwnsWallet(caller, walletId);
    return this.keys.list(walletId);
  }

  @Delete(':keyId')
  @ApiEndpoint({
    summary: 'Revoke a wallet key',
    message: 'Wallet key revoked',
    access: 'session',
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  async revoke(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Param('keyId') keyId: string,
  ): Promise<null> {
    assertOwnsWallet(caller, walletId);
    if (!KEY_ID.test(keyId))
      throw new AppError('VALIDATION_FAILED', 'keyId is not a valid key ID.');
    await this.keys.revoke(walletId, keyId);
    return null;
  }
}
