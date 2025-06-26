import { Body, Controller, Logger, Post } from '@nestjs/common';

import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { DiscordService } from '@/services/discord.service';
import { SettingsService } from '@/verification/settings.service';

import { DecodedData } from '@/models/app.interface';
import { DataService } from './services/data.service';

@Controller()
export class AppController {

  constructor(
    private readonly walletSvc: WalletService,
    private readonly nonceSvc: NonceService,
    private readonly discordSvc: DiscordService,
    private readonly settingsSvc: SettingsService,
    private readonly dataSvc: DataService,
  ) {}

  @Post('verify-signature')
  async verify(@Body() data: { data: DecodedData; signature: string }) {
    try {
      // 1. Verify the wallet signature
      const recoveredAddress = await this.walletSvc.verifySignature(
        data.data,
        data.signature,
      );

      // 2. Invalidate the nonce
      await this.nonceSvc.invalidateNonce(data.data.userId);
      Logger.log(`Nonce deleted for userId: ${data.data.userId}`);

      // 3. Fetch the collection-role mapping for this channel
      const mapping = await this.settingsSvc.getMappingByChannel(
        data.data.channelId,
      );
      if (!mapping) {
        this.discordSvc.throwError(
          data.data.nonce,
          'This channel is not set up for any collection.',
        );
        throw new Error('Channel not set up for verification');
      }

      // 4. Check asset ownership using the collection slug
      const assets = await this.dataSvc.checkAssetOwnership(
        recoveredAddress,
        mapping.collectionSlug,
      );
      if (!assets) {
        this.discordSvc.throwError(
          data.data.nonce,
          'Your address does not own the asset required for this role.',
        );
        throw new Error('Address does not own the asset');
      }

      Logger.log(
        `Verification successful for address: ${recoveredAddress}`,
        `Assets: ${assets}`,
      );

      // 5. Assign the role to the user
      await this.discordSvc.addUserRole(
        data.data.userId,
        mapping.roleId,
        data.data.discordId,
        data.data.address,
        data.data.nonce,
      );
      Logger.log(`Role added to user ${data.data.userId}`);

      // 6. Return success
      return {
        message: 'Verification successful',
        address: recoveredAddress,
      };
    } catch (error: any) {
      return {
        message: 'Verification failed',
        error: error.message,
      };
    }
  }
}
