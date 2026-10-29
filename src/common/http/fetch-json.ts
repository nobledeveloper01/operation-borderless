// Outbound JSON fetch with a timeout, no redirects, a size cap and bounded jittered retries.
import { FX_FETCH_RETRY, withRetry } from '../retry/retry.js';

export interface FetchJsonOptions {
  timeoutMs: number;
  retries?: number;
  baseDelayMs?: number;
  maxBytes?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type FetchFailureKind =
  'network' | 'timeout' | 'status' | 'rate_limited' | 'invalid_body';

export class FetchFailure extends Error {
  constructor(
    readonly kind: FetchFailureKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FetchFailure';
  }

  // Only failures a second try could fix are worth retrying; a 4xx or a 429 never is.
  get retryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'status' && (this.status ?? 0) >= 500)
    );
  }
}

export async function fetchJson(
  url: string,
  options: FetchJsonOptions,
): Promise<unknown> {
  const policy = {
    ...FX_FETCH_RETRY,
    retries: options.retries ?? FX_FETCH_RETRY.retries,
    baseDelayMs: options.baseDelayMs ?? FX_FETCH_RETRY.baseDelayMs,
  };
  return withRetry(
    async () => {
      try {
        return await fetchOnce(url, options);
      } catch (error) {
        throw error instanceof FetchFailure
          ? error
          : new FetchFailure('network', (error as Error).message);
      }
    },
    policy,
    (error) => error instanceof FetchFailure && error.retryable,
    { sleep: options.sleep },
  );
}

async function fetchOnce(
  url: string,
  options: FetchJsonOptions,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new FetchFailure(
        'timeout',
        `No answer within ${options.timeoutMs} ms`,
      );
    }
    throw new FetchFailure('network', (error as Error).message);
  }
  if (response.status === 429)
    throw new FetchFailure(
      'rate_limited',
      'The provider is rate limiting us',
      429,
    );
  if (!response.ok)
    throw new FetchFailure(
      'status',
      `The provider answered ${response.status}`,
      response.status,
    );

  const text = await readCapped(response, options.maxBytes ?? 1_000_000);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FetchFailure('invalid_body', 'The answer is not JSON');
  }
}

// Reads the body chunk by chunk and stops as soon as it passes the cap, so a huge answer never fills memory.
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new FetchFailure('invalid_body', 'The answer is too large');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new FetchFailure('invalid_body', 'The answer is too large');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
