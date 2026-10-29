import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { RESPONSE_MESSAGE } from '../../../src/common/responses/response-message.decorator.js';
import { SuccessInterceptor } from '../../../src/common/responses/success.interceptor.js';

function contextFor(handler: () => void, statusCode = 201): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({ id: 'req-12345678' }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuccessInterceptor', () => {
  const interceptor = new SuccessInterceptor(new Reflector());
  const next = (data: unknown): CallHandler => ({ handle: () => of(data) });

  it('wraps the handler result with the route message', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(RESPONSE_MESSAGE, 'Swap completed', handler);
    const body = await firstValueFrom(
      interceptor.intercept(contextFor(handler), next({ transactionId: 't1' })),
    );
    expect(body).toMatchObject({
      success: true,
      statusCode: 201,
      message: 'Swap completed',
      data: { transactionId: 't1' },
      requestId: 'req-12345678',
    });
  });

  it('falls back to a default message', async () => {
    const body = await firstValueFrom(
      interceptor.intercept(
        contextFor(() => undefined, 200),
        next(null),
      ),
    );
    expect(body.message).toBe('Request completed');
    expect(body.data).toBeNull();
  });
});
