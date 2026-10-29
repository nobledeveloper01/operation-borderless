# ADR-016: A transactional outbox, delivered inside the API as in-app notices

**Context.** Other systems (a mobile app, a notifier, a ledger feed) need to hear when money
moves. Sending a message straight from the request can lose it, if the process dies after the
commit, or invent it, if the message is sent and the transaction then rolls back. You asked for
this to run internally, without a queue or other outside service.

**Decision.**

- `LedgerService.post` writes `outbox_events` rows in the same database transaction as the
  movement. Events: `deposit.completed`, `swap.completed`, `transfer.sent`,
  `transfer.received`, and `balance.low` when a debit takes a balance from at least
  `LOW_BALANCE_USD` (10 by default) to below it. Payloads hold IDs, currencies and amounts only,
  never an email or phone number.
- Every second a relay claims due events with `FOR UPDATE SKIP LOCKED` and moves them into a
  BullMQ queue, with the event ID as the job ID, so an event is never queued twice. Workers
  deliver them; an event queued but lost from Redis is queued again after five minutes. (Since
  ADR-020; before, one loop per process polled the table.)
- Each event is handled in its own savepoint. A failure rolls back only that event, records the
  error, and schedules the next try with full-jitter exponential backoff (1 s base, 5 minute
  cap). After 10 retries it is parked as failed and counted in `borderless_outbox_failed`.
- The one consumer today is `NotificationsHandler`. It writes an in-app notice per event, dated
  when the money moved. A unique `event_id` makes a second delivery a no-op, so
  at-least-once delivery never shows a notice twice.
- `GET /api/v1/wallets/{walletId}/notifications` (newest first, `?unread=true`, `limit` up to 100) and `POST .../{notificationId}/read`, for the wallet's owner only.

**Why the database and not Redis or a broker.** The guarantee comes from writing the event in the
money transaction, which a separate broker can't join. Postgres already holds both, and
`SKIP LOCKED` lets several relays share it. Redis and BullMQ (ADR-020) only carry delivery jobs;
the table stays the record of truth.

**Not done, and why.** Email or SMS notices need an SMTP server or an SMS provider, which are
outside services; you asked for none. Adding one is a second handler on the same outbox, with
the same retries and the event ID as the idempotency key for the provider. Webhooks to
partner URLs are left out for the same reason.

**Consequences.** Events are at least once and ordered by commit time per wallet, not globally.
Delivered events stay in the table; a real system would archive them after a retention period.
