import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsHandler } from './notifications.handler.js';
import { OutboxDelivery } from './outbox-delivery.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxService } from './outbox.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [OutboxService, OutboxRelay, OutboxDelivery, NotificationsHandler],
  exports: [OutboxService, OutboxRelay, OutboxDelivery, NotificationsHandler],
})
export class OutboxModule {}
