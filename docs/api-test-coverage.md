# API Test Coverage

Written by `yarn test:routes` from a full test run: every request the API test apps
answered, by route template and status. `yarn test` fails if a documented route never answers
with success.

| Route | What | Calls | Statuses tested | Documented but not tested |
| --- | --- | --: | --- | --- |
| `POST /api/v1/auth/login` | Log in with an email or phone number and password | 28 | 200, 400, 401, 429, 503 | 500 |
| `POST /api/v1/auth/refresh` | Swap a refresh token for a new pair | 10 | 200, 400, 401, 429 | 500 |
| `POST /api/v1/auth/logout` | End this session | 5 | 200, 401, 403, 429 | 500 |
| `POST /api/v1/auth/logout-all` | End every session and revoke every wallet key on this account | 6 | 200, 401, 403, 429 | 500 |
| `GET /api/v1/auth/me` | Who am I signed in as? | 27 | 200, 401, 403, 429 | 500 |
| `GET /api/v1/fx/rates` | Current rates between every pair of stablecoins | 26 | 200, 429 | 500, 503 |
| `POST /api/v1/quotes` | Get a price that holds for 30 seconds | 16 | 201, 400, 401, 422, 429, 503 | 500 |
| `GET /api/v1/wallets/:walletId/notifications` | List your notices, newest first | 12 | 200, 400, 401, 404, 429 | 500 |
| `POST /api/v1/wallets/:walletId/notifications/:notificationId/read` | Mark a notice as read | 8 | 200, 400, 401, 404, 429 | 500 |
| `POST /api/v1/wallets/:walletId/deposits` | Deposit a stablecoin into your wallet (simulated) | 180 | 201, 400, 401, 404, 422, 429, 503 | 500 |
| `POST /api/v1/wallets/:walletId/swaps` | Swap one stablecoin for another inside your wallet | 101 | 201, 400, 401, 404, 409, 422, 429, 500, 503 | - |
| `POST /api/v1/transfers` | Send money from your wallet to another wallet | 123 | 201, 400, 401, 404, 409, 422, 429, 503 | 500 |
| `GET /api/v1/wallets/:walletId/transactions` | List your transactions, newest first | 30 | 200, 400, 401, 404, 429 | 500 |
| `GET /api/v1/transactions/:transactionId` | Get one of your transactions | 12 | 200, 400, 401, 404, 429 | 500 |
| `GET /health` | Is the process up? | 28 | 200 | 500 |
| `GET /health/ready` | Can the API serve traffic? | 6 | 200, 503 | 500 |
| `POST /api/v1/wallets` | Create a wallet with an email or phone number | 177 | 201, 400, 409, 429, 503 | 500 |
| `GET /api/v1/wallets/:walletId` | Get your wallet and its balances | 15 | 200, 400, 401, 404, 429 | 500 |
| `GET /api/v1/wallets/:walletId/balances` | Get your balances | 11 | 200, 400, 401, 404, 429 | 500 |
| `POST /api/v1/wallets/:walletId/keys` | Create a wallet key for scripts and servers | 20 | 201, 400, 401, 403, 404, 409, 429, 503 | 500 |
| `GET /api/v1/wallets/:walletId/keys` | List active wallet keys (secrets are never shown again) | 11 | 200, 400, 401, 403, 404, 429 | 500 |
| `DELETE /api/v1/wallets/:walletId/keys/:keyId` | Revoke a wallet key | 10 | 200, 400, 401, 403, 404, 429 | 500 |
| `GET /api/v1/ops/metrics` | Prometheus metrics for this API process | 12 | 200, 401, 404, 429 | 500 |
| `GET /api/v1/ops/ledger-check` | Check that every balance equals its ledger lines | 12 | 200, 401, 404, 429 | 500 |
| `GET /api/v1/ops/platform-account` | What the platform has collected in fees and rounding | 5 | 200, 401, 404, 429 | 500 |
