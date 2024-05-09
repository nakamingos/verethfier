import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';

import { DiscordService } from '@/services/discord.service';
import { NonceService } from '@/services/nonce.service';
import { WalletService } from '@/services/wallet.service';
import { DbService } from '@/services/db.service';

@Module({
  imports: [
    CacheModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DiscordService,
    NonceService,
    WalletService,
    DbService
  ],
})
export class AppModule {}
