import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
// import { HttpModule } from '@nestjs/axios';

import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { NonceService } from '@/services/nonce.service';
import { WalletService } from '@/services/wallet.service';
import { DbService } from '@/services/db.service';
import { DataService } from './services/data.service';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    // HttpModule,
    CacheModule.register(),
    VerificationModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    NonceService,
    WalletService,
    DbService,
    DataService
  ],
})
export class AppModule {}
