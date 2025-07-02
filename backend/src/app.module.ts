import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';

import { DiscordService } from '@/services/discord.service';
import { NonceService } from '@/services/nonce.service';
import { WalletService } from '@/services/wallet.service';
import { DbService } from '@/services/db.service';
import { DataService } from './services/data.service';
import { VerifyService } from './services/verify.service';

const supabaseUrl = 'https://kcbuycbhynlmsrvoegzp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
    {
      provide: SupabaseClient,
      useFactory: () => createClient(supabaseUrl, supabaseKey),
    },
    DataService,
    VerifyService
  ],
})
export class AppModule {}
