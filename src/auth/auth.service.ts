import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { LoginDto, LoginResultDto } from './dto.js';
import { burnPasswordCheck, verifyPassword } from './passwords.js';
import { SessionsService } from './sessions.service.js';

// One message for every failed login, so a caller can't tell a wrong password from an unknown email.
const LOGIN_REFUSED = 'The email, phone number or password is wrong.';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly accounts: AccountsService,
    private readonly sessions: SessionsService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResultDto> {
    const account = await this.accounts.findByIdentifier(dto);
    if (!account) {
      await burnPasswordCheck(dto.password);
      throw new AppError('UNAUTHENTICATED', LOGIN_REFUSED);
    }
    const passwordOk = await verifyPassword(account.passwordHash, dto.password);
    const locked =
      account.lockedUntil !== null && account.lockedUntil > new Date();
    if (locked) throw new AppError('UNAUTHENTICATED', LOGIN_REFUSED);
    if (!passwordOk) {
      await this.accounts.recordFailedLogin(account.id);
      throw new AppError('UNAUTHENTICATED', LOGIN_REFUSED);
    }

    await this.accounts.clearFailedLogins(account.id);
    return this.db.transaction(async (manager) => {
      const wallets = await manager.query<{ id: string }[]>(
        'SELECT id FROM wallets WHERE account_id = $1',
        [account.id],
      );
      return {
        walletId: wallets[0]!.id,
        session: await this.sessions.start(manager, account.id),
      };
    });
  }
}
