import {
  type ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppError } from '../../../src/common/errors/app-error.js';
import {
  AllExceptionsFilter,
  loggableError,
} from '../../../src/common/errors/all-exceptions.filter.js';

function run(exception: unknown) {
  const res = { statusCode: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        id: 'req-12345678',
        originalUrl: '/api/v1/x?secret=1',
      }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return res as { statusCode: number; body: Record<string, unknown> };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps an AppError to its code and status', () => {
    const { statusCode, body } = run(new AppError('SERVICE_BUSY', 'Busy'));
    expect(
      run(Object.assign(new Error('bigint out of range'), { code: '22003' }))
        .body.code,
    ).toBe('BALANCE_LIMIT');
    expect(statusCode).toBe(503);
    expect(body).toMatchObject({
      code: 'SERVICE_BUSY',
      message: 'Busy',
      requestId: 'req-12345678',
      path: '/api/v1/x',
    });
  });

  it('lists every validation message', () => {
    const { statusCode, body } = run(
      new BadRequestException(['a is wrong', 'b is wrong']),
    );
    expect(statusCode).toBe(400);
    expect(body).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'a is wrong',
      details: { errors: ['a is wrong', 'b is wrong'] },
    });
  });

  it('maps unknown routes, rate limits and lock timeouts', () => {
    expect(run(new NotFoundException()).body.code).toBe('ROUTE_NOT_FOUND');
    expect(run(new ThrottlerException()).statusCode).toBe(429);
    expect(
      run(Object.assign(new Error('canceling statement'), { code: '57014' }))
        .body.code,
    ).toBe('SERVICE_BUSY');
    for (const code of ['40P01', '40001']) {
      expect(
        run(Object.assign(new Error('deadlock detected'), { code })).statusCode,
      ).toBe(503);
    }
  });

  it('TC-044 hides unexpected errors behind a generic 500', () => {
    const { statusCode, body } = run(
      new Error('relation "secret_table" does not exist'),
    );
    expect(statusCode).toBe(500);
    expect(body.message).toBe('Something went wrong.');
    expect(JSON.stringify(body)).not.toContain('secret_table');
  });

  it('logs query errors without their SQL parameters', () => {
    const failed = Object.assign(new Error('insert failed'), {
      name: 'QueryFailedError',
      code: '23502',
      query: 'INSERT INTO accounts ...',
      parameters: ['$argon2id$v=19$secret-hash', Buffer.from('ciphertext')],
    });
    const logged = loggableError(failed);
    expect(logged).toMatchObject({
      type: 'QueryFailedError',
      message: 'insert failed',
      code: '23502',
    });
    expect(JSON.stringify(logged)).not.toContain('argon2id');
    expect(logged).not.toHaveProperty('parameters');
    expect(logged).not.toHaveProperty('query');
  });
});
