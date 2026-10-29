import { CreateSchema1793270000000 } from './1793270000000-CreateSchema.js';
import { AddSessionExpiry1793280000000 } from './1793280000000-AddSessionExpiry.js';

// Listing migrations by hand means the app, the CLI and the tests can't drift apart.
export const migrations = [
  CreateSchema1793270000000,
  AddSessionExpiry1793280000000,
];
