import { Module } from '@nestjs/common';
import { SwapsController } from './swaps.controller.js';
import { SwapsService } from './swaps.service.js';

@Module({ controllers: [SwapsController], providers: [SwapsService] })
export class SwapsModule {}
