import {
  fetchJson,
  FetchFailure,
} from '../../../../src/common/http/fetch-json.js';

const answer = (status: number, body = '{"ok":true}') =>
  new Response(body, { status });

describe('fetchJson', () => {
  const noWait = vi.fn(() => Promise.resolve());
  afterEach(() => {
    vi.unstubAllGlobals();
    noWait.mockClear();
  });

  it('retries server errors at most twice, then gives up', async () => {
    const fetch = vi.fn(() => Promise.resolve(answer(503)));
    vi.stubGlobal('fetch', fetch);
    await expect(
      fetchJson('https://x.test', { timeoutMs: 100, sleep: noWait }),
    ).rejects.toMatchObject({ kind: 'status', status: 503 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(noWait).toHaveBeenCalledTimes(2);
  });

  it('TC-018 never retries a 4xx or a 429', async () => {
    for (const status of [400, 404, 429]) {
      const fetch = vi.fn(() => Promise.resolve(answer(status)));
      vi.stubGlobal('fetch', fetch);
      await expect(
        fetchJson('https://x.test', { timeoutMs: 100, sleep: noWait }),
      ).rejects.toBeInstanceOf(FetchFailure);
      expect(fetch, String(status)).toHaveBeenCalledTimes(1);
    }
  });

  it('recovers when a retry succeeds, and refuses redirects and non-JSON', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('socket hang up'))
      .mockResolvedValueOnce(answer(200));
    vi.stubGlobal('fetch', fetch);
    await expect(
      fetchJson('https://x.test', { timeoutMs: 100, sleep: noWait }),
    ).resolves.toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(answer(200, '<html>'))),
    );
    await expect(
      fetchJson('https://x.test', { timeoutMs: 100, sleep: noWait }),
    ).rejects.toMatchObject({ kind: 'invalid_body' });
  });

  it('TC-015 times out a slow provider and counts it as retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('t'), { name: 'TimeoutError' })),
            ),
          ),
      ),
    );
    await expect(
      fetchJson('https://x.test', { timeoutMs: 20, retries: 1, sleep: noWait }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('fetchJson size cap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stops reading an endless answer once it passes the cap', async () => {
    const chunk = new Uint8Array(64 * 1024);
    const endless = new ReadableStream<Uint8Array>({
      pull: (c) => c.enqueue(chunk),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(endless, { status: 200 }))),
    );
    await expect(
      fetchJson('https://x.test', {
        timeoutMs: 60_000,
        maxBytes: 256 * 1024,
        retries: 0,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_body' });
  });
});
