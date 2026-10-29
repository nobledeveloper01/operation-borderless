// Load test for a local compose stack: node scripts/load-test.mjs [seconds] [concurrency]
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.LOAD_BASE_URL ?? 'https://localhost:8443/api/v1';
const SECONDS = Number(process.argv[2] ?? 20);
const CONCURRENCY = Number(process.argv[3] ?? 32);
const WALLETS = 40;

// The local proxy uses Caddy's own certificate authority, so only localhost skips the check.
if (new URL(BASE).hostname === 'localhost')
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function call(method, path, token, body, key) {
  const started = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ms: performance.now() - started, json };
}

function summary(name, results, seconds) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const at = (p) =>
    ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]?.toFixed(1);
  const codes = {};
  for (const r of results) codes[r.status] = (codes[r.status] ?? 0) + 1;
  return {
    scenario: name,
    requests: results.length,
    perSecond: Math.round(results.length / seconds),
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: ms.at(-1)?.toFixed(1),
    statuses: JSON.stringify(codes),
  };
}

// Runs one request shape from many workers at once for the given time.
async function run(name, request) {
  const results = [];
  const end = Date.now() + SECONDS * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async (_, worker) => {
      while (Date.now() < end) results.push(await request(worker));
    }),
  );
  return summary(name, results, SECONDS);
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function totalUsdx(wallets) {
  let total = 0n;
  for (const w of wallets) {
    const r = await call('GET', `/wallets/${w.id}/balances`, w.token);
    const usdx = r.json.data.balances.find((b) => b.currency === 'USDx').amount;
    total += BigInt(usdx.replace('.', ''));
  }
  return total;
}

const wallets = [];
for (let i = 0; i < WALLETS; i++) {
  const r = await call('POST', '/wallets', null, {
    email: `load-${Date.now()}-${i}@example.com`,
    password: 'correct horse battery staple',
  });
  if (r.status !== 201) throw new Error(`wallet create answered ${r.status}`);
  wallets.push({
    id: r.json.data.walletId,
    token: r.json.data.session.accessToken,
  });
  await call(
    'POST',
    `/wallets/${wallets[i].id}/deposits`,
    wallets[i].token,
    { currency: 'USDx', amount: '1000' },
    crypto.randomUUID(),
  );
}
for (let i = 0; i < 30; i++) {
  const w = wallets[i % WALLETS];
  await call(
    'POST',
    `/wallets/${w.id}/swaps`,
    w.token,
    { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '1' },
    crypto.randomUUID(),
  );
}
const before = await totalUsdx(wallets);
await sleep(500);

const rows = [];
rows.push(
  await run('GET balances', (n) => {
    const w = wallets[n % WALLETS];
    return call('GET', `/wallets/${w.id}/balances`, w.token);
  }),
);
rows.push(
  await run('GET history', (n) => {
    const w = wallets[n % WALLETS];
    return call('GET', `/wallets/${w.id}/transactions?limit=20`, w.token);
  }),
);
rows.push(await run('GET fx/rates', () => call('GET', '/fx/rates')));
rows.push(
  await run('POST deposits', (n) => {
    const w = wallets[n % WALLETS];
    return call(
      'POST',
      `/wallets/${w.id}/deposits`,
      w.token,
      { currency: 'EURx', amount: '1' },
      crypto.randomUUID(),
    );
  }),
);
rows.push(
  await run('POST transfers, random pairs', () => {
    const from = pick(wallets);
    let to = pick(wallets);
    while (to === from) to = pick(wallets);
    return call(
      'POST',
      '/transfers',
      from.token,
      {
        fromWalletId: from.id,
        toWalletId: to.id,
        fromCurrency: 'USDx',
        amount: '0.01',
      },
      crypto.randomUUID(),
    );
  }),
);
const hot = wallets[0];
rows.push(
  await run('POST transfers, one hot sender', (n) => {
    const to = wallets[1 + (n % (WALLETS - 1))];
    return call(
      'POST',
      '/transfers',
      hot.token,
      {
        fromWalletId: hot.id,
        toWalletId: to.id,
        fromCurrency: 'USDx',
        amount: '0.01',
      },
      crypto.randomUUID(),
    );
  }),
);

const after = await totalUsdx(wallets);
console.table(rows);
console.log(
  `USDx across all ${WALLETS} wallets: before ${before}, after ${after} (millionths), ${before === after ? 'unchanged' : 'CHANGED'}`,
);
