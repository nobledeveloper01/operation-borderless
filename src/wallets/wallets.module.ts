import { Module } from '@nestjs/common';
import { WalletKeysController } from './wallet-keys.controller.js';
import { WalletKeysService } from './wallet-keys.service.js';
import { WalletsController } from './wallets.controller.js';
import { WalletsService } from './wallets.service.js';

@Module({
  controllers: [WalletsController, WalletKeysController],
  providers: [WalletsService, WalletKeysService],
  exports: [WalletsService],
})
export class WalletsModule {}
