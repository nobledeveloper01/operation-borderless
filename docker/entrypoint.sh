#!/bin/sh
set -eu
# The API applies pending migrations before starting; workers start after it and never migrate.
if [ "${APP_ROLE:-all}" != "worker" ]; then
  node node_modules/typeorm/cli.js migration:run -d dist/common/database/data-source.js
fi
# Hand the process over to Node, so it gets the stop signals.
exec node dist/main.js
