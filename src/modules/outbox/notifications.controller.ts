import { Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { assertOwnsWallet } from '../auth/ownership.js';
import { Caller, type Principal } from '../auth/principal.js';
import { AppError } from '../../common/errors/app-error.js';
import { returned } from '../../common/database/returned.js';
import { ApiEndpoint } from '../../common/responses/api-endpoint.decorator.js';
import { IdParam } from '../../common/validation/id-param.js';
import { NotificationDto, NotificationsQueryDto } from './dto.js';

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string;
  created_at: Date;
  read_at: Date | null;
}

const toDto = (r: Row): NotificationDto => ({
  notificationId: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  createdAt: r.created_at.toISOString(),
  readAt: r.read_at?.toISOString() ?? null,
});

@ApiTags('Notifications')
@Controller('wallets/:walletId/notifications')
export class NotificationsController {
  constructor(private readonly db: DataSource) {}

  @Get()
  @ApiEndpoint({
    summary: 'List your notices, newest first',
    description:
      'Deposits, swaps, transfers sent and received, and low-balance warnings, delivered from the outbox.',
    message: 'Notifications found',
    type: NotificationDto,
    isArray: true,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  async list(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationDto[]> {
    assertOwnsWallet(caller, walletId);
    const rows = await this.db.query<Row[]>(
      `SELECT id, kind, title, body, created_at, read_at FROM notifications
        WHERE wallet_id = $1 AND ($2::boolean IS NOT TRUE OR read_at IS NULL)
        ORDER BY created_at DESC, id DESC LIMIT $3`,
      [walletId, query.unread ?? null, query.limit],
    );
    return rows.map(toDto);
  }

  @Post(':notificationId/read')
  @ApiEndpoint({
    summary: 'Mark a notice as read',
    message: 'Notification marked as read',
    type: NotificationDto,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND],
  })
  async markRead(
    @Caller() caller: Principal,
    @IdParam('walletId') walletId: string,
    @IdParam('notificationId') notificationId: string,
  ): Promise<NotificationDto> {
    assertOwnsWallet(caller, walletId);
    const [row] = returned<Row>(
      await this.db.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now())
          WHERE id = $1 AND wallet_id = $2
          RETURNING id, kind, title, body, created_at, read_at`,
        [notificationId, walletId],
      ),
    );
    if (!row)
      throw new AppError(
        'NOTIFICATION_NOT_FOUND',
        'No notification with this ID.',
      );
    return toDto(row);
  }
}
