import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
// import { HttpModule } from '@nestjs/axios';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';

import { DiscordService } from '@/services/discord.service';
import { NonceService } from '@/services/nonce.service';
import { WalletService } from '@/services/wallet.service';
import { DbService } from '@/services/db.service';
import { DataService } from './services/data.service';
import { VerifyService } from './services/verify.service';

@Module({
  imports: [
    // HttpModule,
    CacheModule.register(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DiscordService,
    NonceService,
    WalletService,
    DbService,
    DataService,
    VerifyService
  ],
})
export class AppModule {}
