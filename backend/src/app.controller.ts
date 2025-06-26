import { Body, Controller, Post } from '@nestjs/common';

import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { DiscordService } from '@/services/discord.service';
import { SettingsService } from '@/verification/settings.service';

import { DecodedData } from '@/models/app.interface';
import { DataService } from './services/data.service';

interface VerifySignatureRequest {
  data: DecodedData;
  signature: string;
}

interface VerifySignatureResponse {
  message: string;
  address?: string;
  error?: string;
}

@Controller()
export class AppController {
  constructor(
    private readonly walletService: WalletService,
    private readonly nonceService: NonceService,
    private readonly discordService: DiscordService,
    private readonly settingsService: SettingsService,
    private readonly dataService: DataService,
  ) {}

  @Post('verify-signature')
  async verify(
    @Body() request: VerifySignatureRequest
  ): Promise<VerifySignatureResponse> {
    try {
      const recoveredAddress = await this.verifyWalletSignature(request.data, request.signature);
      await this.invalidateUserNonce(request.data.userId);

      const mapping = await this.getChannelMapping(request.data.channelId);
      if (!mapping) {
        await this.handleDiscordError(request.data.nonce, 'This channel is not set up for any collection.');
        throw new Error('Channel not set up for verification');
      }

      const ownsAsset = await this.checkUserAssetOwnership(recoveredAddress, mapping.collectionSlug);
      if (!ownsAsset) {
        await this.handleDiscordError(request.data.nonce, 'Your address does not own the asset required for this role.');
        throw new Error('Address does not own the asset');
      }

      await this.assignUserRole(
        request.data.userId,
        mapping.roleId,
        request.data.discordId,
        recoveredAddress,
        request.data.nonce,
      );

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

  private async verifyWalletSignature(decodedData: DecodedData, signature: string): Promise<string> {
    return await this.walletService.verifySignature(decodedData, signature);
  }

  private async invalidateUserNonce(userId: string): Promise<void> {
    await this.nonceService.invalidateNonce(userId);
  }

  private async getChannelMapping(channelId: string) {
    return await this.settingsService.getMappingByChannel(channelId);
  }

  private async checkUserAssetOwnership(address: string, collectionSlug: string): Promise<boolean> {
    const assetCount = await this.dataService.checkAssetOwnership(address, collectionSlug);
    return assetCount > 0;
  }

  private async handleDiscordError(nonce: string, message: string): Promise<void> {
    await this.discordService.throwError(nonce, message);
  }

  private async assignUserRole(
    userId: string,
    roleId: string,
    discordId: string,
    address: string,
    nonce: string,
  ): Promise<void> {
    await this.discordService.addUserRole(userId, roleId, discordId, address, nonce);
  }
}
