import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
// import { HttpModule } from '@nestjs/axios';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';

import { DiscordService } from '@/services/discord.service';
import { DiscordMessageService } from '@/services/discord-message.service';
import { DiscordVerificationService } from '@/services/discord-verification.service';
import { DiscordCommandsService } from '@/services/discord-commands.service';
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
    DiscordMessageService,
    DiscordVerificationService,
    DiscordCommandsService,
    NonceService,
    WalletService,
    DbService,
    DataService,
    VerifyService
  ],
})
export class AppModule {}
