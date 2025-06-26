import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

import { VerificationService } from './verification.service';
import { SettingsService } from './settings.service';
import { DataService } from '@/services/data.service';
import { DiscordService } from '@/services/discord.service';
import { VerificationController } from './verification.controller';
import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';


@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
  ],
  providers: [
    VerificationService,
    SettingsService,
    DataService,
    DiscordService,
    WalletService,
    NonceService,
    DbService,
  ],
  controllers: [VerificationController],
  exports: [SettingsService, DiscordService],
})
export class VerificationModule {}