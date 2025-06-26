import { Module } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { SettingsService } from './settings.service';
import { DataService } from '@/services/data.service';
import { DiscordService } from '@/services/discord.service';
import { VerificationController } from './verification.controller';
import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { CacheModule } from '@nestjs/cache-manager';
import { DbService } from '@/services/db.service'; // adjust path if needed


@Module({
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
    imports: [CacheModule.register({
        isGlobal: true,
    })],
    exports: [SettingsService, DiscordService],
})
export class VerificationModule {}