import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { DataService } from '@/services/data.service';
import { DiscordService } from '@/services/discord.service';
import { WalletService } from '@/services/wallet.service';
import { DecodedData } from '@/models/app.interface';

@Controller('verification')
export class VerificationController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly dataService: DataService,
    private readonly discordService: DiscordService,
    private readonly walletService: WalletService,
  ) {}

  @Post('verify-signature')
  async verifySignature(@Body() body: { data: DecodedData; signature: string; channelId: string }) {
    const { data, signature, channelId } = body;
    // 1. Validate the wallet signature & nonce
    let address: string;
    try {
      address = await this.walletService.verifySignature(data, signature);
    } catch (err) {
      throw new BadRequestException('Invalid signature or nonce');
    }
    // 2. Get mapping by channel
    const mapping = await this.settingsService.getMappingByChannel(channelId);
    if (!mapping) throw new BadRequestException('No mapping found for this channel');
    // 3. Check asset ownership
    const owns = await this.dataService.checkAssetOwnership(address, mapping.collectionSlug);
    if (owns > 0) {
      // 4. Add user role
      await this.discordService.addUserRole(data.userId, mapping.roleId, mapping.serverId, address, data.nonce);
      return { success: true };
    } else {
      return { success: false, reason: 'No asset ownership' };
    }
  }
}
