// Outbound JSON fetch with a timeout, no redirects, a size cap and bounded jittered retries.

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

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchJson(
  url: string,
  options: FetchJsonOptions,
): Promise<unknown> {
  const retries = options.retries ?? 2;
  const base = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: FetchFailure | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.random() * base * 2 ** attempt);
    try {
      return await fetchOnce(url, options);
    } catch (error) {
      lastError =
        error instanceof FetchFailure
          ? error
          : new FetchFailure('network', (error as Error).message);
      if (!lastError.retryable) break;
    }
  }
  throw lastError ?? new FetchFailure('network', 'No attempt was made');
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

  const text = await response.text();
  if (text.length > (options.maxBytes ?? 1_000_000))
    throw new FetchFailure('invalid_body', 'The answer is too large');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new FetchFailure('invalid_body', 'The answer is not JSON');
  }
}
