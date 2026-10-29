import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsHandler } from './notifications.handler.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { OutboxService } from './outbox.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [OutboxService, OutboxDispatcher, NotificationsHandler],
  exports: [OutboxService, OutboxDispatcher],
})
export class OutboxModule {}
