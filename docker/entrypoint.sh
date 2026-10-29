#!/bin/sh
set -eu
# Apply pending migrations, then hand the process over to Node so it gets stop signals.
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
exec node dist/main.js
