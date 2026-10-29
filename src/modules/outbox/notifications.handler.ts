import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { EventType } from './outbox.service.js';

export interface OutboxEvent {
  id: string;
  type: EventType;
  wallet_id: string;
  payload: Record<string, string | null>;
  created_at: Date;
}

// Turns events into in-app notices dated when the money moved; the unique event_id makes a second delivery a no-op.
@Injectable()
export class NotificationsHandler {
  async handle(manager: EntityManager, event: OutboxEvent): Promise<void> {
    const { title, body } = describe(event);
    await manager.query(
      `INSERT INTO notifications (wallet_id, event_id, kind, title, body, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id) DO NOTHING`,
      [event.wallet_id, event.id, event.type, title, body, event.created_at],
    );
  }
}

function describe(event: OutboxEvent): { title: string; body: string } {
  const p = event.payload;
  switch (event.type) {
    case 'deposit.completed':
      return {
        title: 'Deposit received',
        body: `${p.toAmount} ${p.toCurrency} was added to your wallet.`,
      };
    case 'swap.completed':
      return {
        title: 'Swap completed',
        body: `You swapped ${p.fromAmount} ${p.fromCurrency} for ${p.toAmount} ${p.toCurrency}.`,
      };
    case 'transfer.sent':
      return {
        title: 'Money sent',
        body: `You sent ${p.fromAmount} ${p.fromCurrency}; the receiver got ${p.toAmount} ${p.toCurrency}.`,
      };
    case 'transfer.received':
      return {
        title: 'Money received',
        body: `You received ${p.toAmount} ${p.toCurrency}.`,
      };
    case 'balance.low':
      return {
        title: 'Balance is low',
        body: `Your ${p.currency} balance is ${p.amount}, worth about ${p.usdValue} USD.`,
      };
  }
}
