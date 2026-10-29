import { Module } from '@nestjs/common';
import { DepositsController } from './deposits.controller.js';
import { DepositsService } from './deposits.service.js';

@Module({ controllers: [DepositsController], providers: [DepositsService] })
export class DepositsModule {}
