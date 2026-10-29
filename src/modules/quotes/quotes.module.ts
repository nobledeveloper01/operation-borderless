import { Global, Module } from '@nestjs/common';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';

@Global()
@Module({
  controllers: [QuotesController],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
