import { AppError } from '../common/errors/app-error.js';
import type { Principal } from './principal.js';

// Someone else's wallet looks exactly like a missing one, so IDs can't be probed.
export function assertOwnsWallet(principal: Principal, walletId: string): void {
  if (principal.walletId !== walletId) {
    throw new AppError('WALLET_NOT_FOUND', 'No wallet with this ID.');
  }
}
