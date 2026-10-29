import { Global, Module } from '@nestjs/common';
import { EnvironmentVariables } from '../config/env.validation.js';
import { decodeKey, FieldCipher, parseEncryptionKeys } from './field-cipher.js';

@Global()
@Module({
  providers: [
    {
      provide: FieldCipher,
      inject: [EnvironmentVariables],
      useFactory: (config: EnvironmentVariables) =>
        new FieldCipher({
          encryption: parseEncryptionKeys(config.PII_ENCRYPTION_KEYS),
          activeVersion: config.PII_ACTIVE_KEY_VERSION,
          lookup: decodeKey(config.PII_LOOKUP_KEY, 'lookup key'),
        }),
    },
  ],
  exports: [FieldCipher],
})
export class CryptoModule {}
