import { Injectable, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { DataService } from '@/services/data.service';
import { DiscordService } from '@/services/discord.service';
import { WalletService } from '@/services/wallet.service';
import { DecodedData } from '@/models/app.interface';

export interface VerifyRequestDto {
  data: DecodedData;
  signature: string;
  channelId: string;
}

export interface VerifyResult {
  success: boolean;
  reason?: string;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataService: DataService,
    private readonly discordService: DiscordService,
    private readonly walletService: WalletService,
  ) {}

  async verify(dto: VerifyRequestDto): Promise<VerifyResult> {
    const { data, signature, channelId } = dto;
    let address: string;
    try {
      address = await this.walletService.verifySignature(data, signature);
    } catch (err) {
      return { success: false, reason: 'Invalid signature or nonce' };
    }
    const mapping = await this.settingsService.getMappingByChannel(channelId);
    if (!mapping) return { success: false, reason: 'No mapping found for this channel' };
    const owns = await this.dataService.checkAssetOwnership(address, mapping.collectionSlug);
    if (owns > 0) {
      await this.discordService.addUserRole(data.userId, mapping.roleId, mapping.serverId, address, data.nonce);
      return { success: true };
    } else {
      return { success: false, reason: 'No asset ownership' };
    }
  }
}
