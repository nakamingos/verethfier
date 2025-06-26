import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { DataService } from '@/services/data.service';
import { DiscordService } from '@/services/discord.service';
import { WalletService } from '@/services/wallet.service';
import { DecodedData } from '@/models/app.interface';

interface VerifySignatureRequest {
  data: DecodedData;
  signature: string;
  channelId: string;
}

interface VerifySignatureResponse {
  success: boolean;
  reason?: string;
}

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataService: DataService,
    private readonly discordService: DiscordService,
    private readonly walletService: WalletService,
  ) {}

  @Post('verify-signature')
  async verifySignature(
    @Body() request: VerifySignatureRequest
  ): Promise<VerifySignatureResponse> {
    const { data: decodedData, signature, channelId } = request;

    const userAddress = await this.getVerifiedAddress(decodedData, signature);
    if (!userAddress) {
      throw new BadRequestException('Invalid signature or nonce');
    }

    const channelMapping = await this.getChannelMapping(channelId);
    if (!channelMapping) {
      throw new BadRequestException('No mapping found for this channel');
    }

    const ownsAsset = await this.hasAssetOwnership(userAddress, channelMapping.collectionSlug);
    if (!ownsAsset) {
      return { success: false, reason: 'No asset ownership' };
    }

    await this.assignDiscordRole(
      decodedData.userId,
      channelMapping.roleId,
      channelMapping.serverId,
      userAddress,
      decodedData.nonce,
    );

    return { success: true };
  }

  private async getVerifiedAddress(decodedData: DecodedData, signature: string): Promise<string | null> {
    try {
      return await this.walletService.verifySignature(decodedData, signature);
    } catch {
      return null;
    }
  }

  private async getChannelMapping(channelId: string): Promise<{ collectionSlug: string; roleId: string; serverId: string } | null> {
    return await this.settingsService.getMappingByChannel(channelId);
  }

  private async hasAssetOwnership(address: string, collectionSlug: string): Promise<boolean> {
    const assetCount = await this.dataService.checkAssetOwnership(address, collectionSlug);
    return assetCount > 0;
  }

  private async assignDiscordRole(
    userId: string,
    roleId: string,
    serverId: string,
    address: string,
    nonce: string,
  ): Promise<void> {
    await this.discordService.addUserRole(userId, roleId, serverId, address, nonce);
  }
}
