import { Body, Controller, Logger, Post } from '@nestjs/common';

import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { DiscordService } from '@/services/discord.service';

import { DecodedData } from '@/models/app.interface';
import { DataService } from './services/data.service';

@Controller()
export class AppController {

  constructor(
    private readonly walletSvc: WalletService,
    private readonly nonceSvc: NonceService,
    private readonly discordSvc: DiscordService,
    private readonly dataSvc: DataService,
  ) {}

  @Post('verify-signature')
  async verify(@Body() data: { data: DecodedData & { channelId?: string }, signature: string }) {
    try {
      const payload = data.data;
      const recoveredAddress = await this.walletSvc.verifySignature(
        payload,
        data.signature
      );
      await this.nonceSvc.invalidateNonce(payload.userId);
      Logger.log(`Nonce deleted for userId: ${payload.userId}`);

      // --- Legacy path ---
      if (payload.role) {
        const legacyRoleId = await this.discordSvc['dbSvc'].getServerRole(payload.discordId);
        await this.discordSvc.addUserRole(
          payload.userId,
          legacyRoleId,
          payload.discordId,
          recoveredAddress,
          payload.nonce
        );
        await this.discordSvc['dbSvc'].logUserRole(payload.userId, payload.discordId, legacyRoleId, recoveredAddress);
        return {
          message: 'Verification successful (legacy)',
          address: recoveredAddress,
        };
      }

      // --- New multi-rule path ---
      const assets = await this.dataSvc.getDetailedAssets(recoveredAddress);
      const rules = await this.discordSvc['dbSvc'].getRoleMappings(payload.discordId, payload.channelId);
      // matchesRule: slug NULL/'ALL', channel_id NULL, attr_key/val, min_items
      const matched = rules.filter(r => {
        // Wildcard for slug
        const slugMatch = !r.slug || r.slug === 'ALL' || assets.some(a => a.slug === r.slug);
        // Wildcard for channel
        const channelMatch = !r.channel_id || r.channel_id === payload.channelId;
        // Attribute match
        let attrMatch = true;
        if (r.attr_key && r.attr_val !== undefined) {
          attrMatch = assets.some(a => a.attributes && a.attributes[r.attr_key] == r.attr_val);
        }
        // min_items match
        let minItemsMatch = true;
        if (r.min_items !== undefined && r.min_items !== null) {
          minItemsMatch = assets.length >= r.min_items;
        }
        return slugMatch && channelMatch && attrMatch && minItemsMatch;
      });
      if (!matched.length) {
        await this.discordSvc.throwError(payload.nonce, 'No matching assets');
        throw new Error('No matching assets');
      }
      // Assign all matched roles
      for (const r of matched) {
        await this.discordSvc.addUserRole(
          payload.userId,
          r.role_id,
          payload.discordId,
          recoveredAddress,
          payload.nonce
        );
        await this.discordSvc['dbSvc'].logUserRole(payload.userId, payload.discordId, r.role_id, recoveredAddress);
      }
      return {
        message: 'Verification successful',
        address: recoveredAddress,
      };
    } catch (error) {
      return {
        message: 'Verification failed',
        error: error.message,
      };
    }
  }
}
