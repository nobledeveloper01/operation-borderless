import { Module } from '@nestjs/common';
import { LedgerCheckService } from './ledger-check.service.js';
import { OpsController } from './ops.controller.js';

@Module({
  controllers: [OpsController],
  providers: [LedgerCheckService],
  exports: [LedgerCheckService],
})
export class OpsModule {}
