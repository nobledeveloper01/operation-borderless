import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  type ValueTransformer,
} from 'typeorm';

// Postgres hands bigint back as a string, so this turns it into a real bigint and back.
export const bigintColumn: ValueTransformer = {
  to: (value: bigint | undefined) =>
    value === undefined ? undefined : value.toString(),
  from: (value: string | null) => (value === null ? null : BigInt(value)),
};

@Entity('accounts')
export class Account {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'bytea', nullable: true })
  emailEncrypted: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  emailLookup: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  phoneEncrypted: Buffer | null;

  @Column({ type: 'bytea', nullable: true })
  phoneLookup: Buffer | null;

  @Column('smallint')
  piiKeyVersion: number;

  @Column('text')
  passwordHash: string;

  @Column('integer')
  failedLogins: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  accountId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('balances')
export class Balance {
  @PrimaryColumn('uuid')
  walletId: string;

  @PrimaryColumn('text')
  currency: string;

  @Column({ type: 'bigint', transformer: bigintColumn })
  amount: bigint;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  accountId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column('timestamptz')
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  revokedReason: 'LOGOUT' | 'LOGOUT_ALL' | 'REFRESH_REUSE' | null;
}

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sessionId: string;

  @Column('bytea')
  tokenHash: Buffer;

  @Column('timestamptz')
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

@Entity('wallet_keys')
export class WalletKey {
  @PrimaryColumn('text')
  id: string;

  @Column('uuid')
  walletId: string;

  @Column('text')
  name: string;

  @Column('bytea')
  secretHash: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}

// Everything TypeORM maps for this service, handed to the connection by AppModule.
export const ACCOUNT_ENTITIES = [
  Account,
  Wallet,
  Balance,
  Session,
  RefreshToken,
  WalletKey,
];
