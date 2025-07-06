import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
    // Security: Rate limiting
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 1000, // 1 second
      limit: 3,  // 3 requests per second
    }, {
      name: 'medium',
      ttl: 10000, // 10 seconds
      limit: 20,  // 20 requests per 10 seconds
    }, {
      name: 'long',
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute
    }]),
  ],
  controllers: [AppController],
  providers: [
    // Security: Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
