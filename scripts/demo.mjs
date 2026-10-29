// Walks through the API against a running compose stack: yarn demo (start it first with docker compose up).
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.DEMO_BASE_URL ?? 'https://localhost:8443/api/v1';
const OPS_TOKEN =
  process.env.OPS_TOKEN ?? 'local-ops-token-for-the-compose-stack-only';

// The local proxy uses Caddy's own certificate authority, so only localhost skips the check.
if (new URL(BASE).hostname === 'localhost')
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function call(method, path, { token, body, key, ops } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
      ...(ops ? { 'X-Ops-Token': OPS_TOKEN } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return {
    status: res.status,
    replayed: res.headers.get('idempotent-replayed') === 'true',
    json,
  };
}

const step = (n, text) => console.log(`\n${n}. ${text}`);
const line = (text) => console.log(`   ${text}`);
const tx = (t) =>
  `${t.fromAmount ?? '-'} ${t.fromCurrency ?? ''} -> ${t.toAmount} ${t.toCurrency}` +
  (t.feeBps ? ` (fee ${t.feeAmount} ${t.fromCurrency}, rate ${t.rate})` : '');

async function wallet(label, identifier) {
  const r = await call('POST', '/wallets', {
    body: { ...identifier, password: 'correct horse battery staple' },
  });
  if (r.status !== 201)
    throw new Error(
      `Creating ${label} answered ${r.status}: ${r.json?.message}`,
    );
  return {
    label,
    id: r.json.data.walletId,
    token: r.json.data.session.accessToken,
  };
}

const run = Date.now();
const health = await fetch(BASE.replace('/api/v1', '/health/ready')).catch(
  () => null,
);
if (!health?.ok) {
  console.error(
    'The API is not answering. Start it with: docker compose up --build',
  );
  process.exit(1);
}

step(1, 'Ada signs up with an email, Kofi with a phone number');
const ada = await wallet('Ada', { email: `ada-${run}@example.com` });
const kofi = await wallet('Kofi', {
  phoneNumber: `+23324${String(run).slice(-7)}`,
});
line(`Ada's wallet ${ada.id}`);
line(`Kofi's wallet ${kofi.id}`);

step(2, 'Ada deposits 100 USDx, then sends the same request again');
const key = crypto.randomUUID();
const first = await call('POST', `/wallets/${ada.id}/deposits`, {
  token: ada.token,
  key,
  body: { currency: 'USDx', amount: '100' },
});
const again = await call('POST', `/wallets/${ada.id}/deposits`, {
  token: ada.token,
  key,
  body: { currency: 'USDx', amount: '100' },
});
line(
  `first: ${first.status}, balance ${first.json.data.balances[0].amount} USDx`,
);
line(
  `again: ${again.status}, replayed ${again.replayed}, balance still ${again.json.data.balances[0].amount} USDx`,
);

step(3, 'Ada asks for a quote to send 25 USDx to Kofi as cGHS');
const quote = await call('POST', '/quotes', {
  token: ada.token,
  body: { fromCurrency: 'USDx', toCurrency: 'cGHS', amount: '25' },
});
if (quote.status !== 201)
  throw new Error(`Quote answered ${quote.status}: ${quote.json?.message}`);
const q = quote.json.data;
line(
  `Kofi would get ${q.toAmount} cGHS; fee ${q.feeAmount} USDx; price held until ${q.expiresAt}`,
);

step(4, "Ada sends it to Kofi's phone number with the quote");
const sent = await call('POST', '/transfers', {
  token: ada.token,
  key: crypto.randomUUID(),
  body: {
    fromWalletId: ada.id,
    toPhoneNumber: `+23324${String(run).slice(-7)}`,
    fromCurrency: 'USDx',
    toCurrency: 'cGHS',
    amount: '25',
    quoteId: q.quoteId,
  },
});
line(
  `${sent.status}: ${tx(sent.json.data.transaction)}; matches the quote: ${sent.json.data.transaction.toAmount === q.toAmount}`,
);
const reuse = await call('POST', '/transfers', {
  token: ada.token,
  key: crypto.randomUUID(),
  body: {
    fromWalletId: ada.id,
    toWalletId: kofi.id,
    fromCurrency: 'USDx',
    toCurrency: 'cGHS',
    amount: '25',
    quoteId: q.quoteId,
  },
});
line(`using the quote again: ${reuse.status} ${reuse.json.code}`);

step(5, 'Ada swaps 10 USDx to cNGN and tries to overspend');
const swapped = await call('POST', `/wallets/${ada.id}/swaps`, {
  token: ada.token,
  key: crypto.randomUUID(),
  body: { fromCurrency: 'USDx', toCurrency: 'cNGN', amount: '10' },
});
line(`${swapped.status}: ${tx(swapped.json.data.transaction)}`);
const over = await call('POST', '/transfers', {
  token: ada.token,
  key: crypto.randomUUID(),
  body: {
    fromWalletId: ada.id,
    toWalletId: kofi.id,
    fromCurrency: 'USDx',
    amount: '1000',
  },
});
line(
  `sending 1000 USDx: ${over.status} ${over.json.code}, available ${over.json.details?.available}`,
);

step(6, "Ada's balances and history");
const balances = await call('GET', `/wallets/${ada.id}/balances`, {
  token: ada.token,
});
for (const b of balances.json.data.balances.filter(
  (b) => b.amount !== '0.000000',
))
  line(
    `${b.currency.padEnd(4)} ${b.amount.padStart(16)}  (about ${b.usdValue} USD)`,
  );
line(`total about ${balances.json.data.totalUsd} USD`);
const history = await call('GET', `/wallets/${ada.id}/transactions`, {
  token: ada.token,
});
for (const t of history.json.data.items)
  line(`${t.type.padEnd(8)} ${t.direction.padEnd(8)} ${tx(t)}`);

step(7, 'Notices delivered from the outbox');
await sleep(2_500);
for (const who of [ada, kofi]) {
  const n = await call('GET', `/wallets/${who.id}/notifications`, {
    token: who.token,
  });
  for (const notice of n.json.data)
    line(`${who.label}: ${notice.title}. ${notice.body}`);
}

step(8, 'The operator checks the books');
const check = await call('GET', '/ops/ledger-check', { ops: true });
if (check.status === 200) {
  const c = check.json.data;
  line(
    `ledger check: ok ${c.ok}, ${c.balancesChecked} balances, ${c.mismatchCount} mismatches, platform matches ${c.platformMatches}`,
  );
  const platform = await call('GET', '/ops/platform-account', { ops: true });
  for (const p of platform.json.data)
    line(`platform ${p.currency}: fees ${p.fees}, rounding ${p.rounding}`);
} else {
  line(
    `operator routes answered ${check.status}; set OPS_TOKEN to the stack's token`,
  );
}
console.log('\nDone.');
