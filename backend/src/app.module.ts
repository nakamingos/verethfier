import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

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
import { DynamicRoleService } from './services/dynamic-role.service';
import { SimpleRoleMonitorService } from './services/simple-role-monitor.service';
import { CONSTANTS } from '@/constants';

@Module({
  imports: [
    CacheModule.register(),
    ScheduleModule.forRoot(),
    // Security: Rate limiting
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: CONSTANTS.RATE_LIMIT.SHORT.TTL,
      limit: CONSTANTS.RATE_LIMIT.SHORT.LIMIT,
    }, {
      name: 'medium',
      ttl: CONSTANTS.RATE_LIMIT.MEDIUM.TTL,
      limit: CONSTANTS.RATE_LIMIT.MEDIUM.LIMIT,
    }, {
      name: 'long',
      ttl: CONSTANTS.RATE_LIMIT.LONG.TTL,
      limit: CONSTANTS.RATE_LIMIT.LONG.LIMIT,
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
    VerifyService,
    DynamicRoleService,
    SimpleRoleMonitorService
  ],
})
export class AppModule {}
