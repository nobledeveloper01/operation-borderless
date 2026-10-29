import { CreateSchema1793270000000 } from './1793270000000-CreateSchema.js';
import { AddSessionExpiry1793280000000 } from './1793280000000-AddSessionExpiry.js';
import { KeepReplayKeyOrder1793290000000 } from './1793290000000-KeepReplayKeyOrder.js';
import { AddFees1793300000000 } from './1793300000000-AddFees.js';
import { AddQuotes1793310000000 } from './1793310000000-AddQuotes.js';

// Listing migrations by hand means the app, the CLI and the tests can't drift apart.
export const migrations = [
  CreateSchema1793270000000,
  AddSessionExpiry1793280000000,
  KeepReplayKeyOrder1793290000000,
  AddFees1793300000000,
  AddQuotes1793310000000,
];
