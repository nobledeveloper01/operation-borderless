import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountsService } from '../accounts/accounts.service.js';
import { ApiEndpoint } from '../common/responses/api-endpoint.decorator.js';
import { AuthService } from './auth.service.js';
import {
  LoginDto,
  LoginResultDto,
  LogoutAllDto,
  MeDto,
  RefreshDto,
  SessionTokensDto,
} from './dto.js';
import { Caller, type Principal } from './principal.js';
import { SessionsService } from './sessions.service.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly accounts: AccountsService,
  ) {}

  @Post('login')
  @ApiEndpoint({
    summary: 'Log in with an email or phone number and password',
    message: 'Logged in',
    type: LoginResultDto,
    access: 'public',
    authRateLimit: true,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
  })
  login(@Body() dto: LoginDto): Promise<LoginResultDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @ApiEndpoint({
    summary: 'Swap a refresh token for a new pair',
    description:
      'Each refresh token works once. Using one twice ends the whole session.',
    message: 'Session refreshed',
    type: SessionTokensDto,
    access: 'public',
    authRateLimit: true,
    errors: [HttpStatus.BAD_REQUEST, HttpStatus.UNAUTHORIZED],
  })
  refresh(@Body() dto: RefreshDto): Promise<SessionTokensDto> {
    return this.sessions.rotate(dto.refreshToken);
  }

  @Post('logout')
  @ApiEndpoint({
    summary: 'End this session',
    message: 'Logged out',
    access: 'session',
  })
  async logout(@Caller() caller: Principal): Promise<null> {
    await this.sessions.revoke(caller.sessionId!);
    return null;
  }

  @Post('logout-all')
  @ApiEndpoint({
    summary: 'End every session and revoke every wallet key on this account',
    message: 'Logged out everywhere',
    type: LogoutAllDto,
    access: 'session',
  })
  logoutAll(@Caller() caller: Principal): Promise<LogoutAllDto> {
    return this.sessions.revokeAll(caller.accountId);
  }

  @Get('me')
  @ApiEndpoint({
    summary: 'Who am I signed in as?',
    message: 'Signed in',
    type: MeDto,
    access: 'session',
  })
  async me(@Caller() caller: Principal): Promise<MeDto> {
    const profile = await this.accounts.profile(caller.accountId);
    return {
      accountId: caller.accountId,
      walletId: caller.walletId,
      via: caller.via,
      ...profile,
    };
  }
}
