import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { NonceService }  from './nonce.service';
import { DiscordService } from './discord.service';
import { DataService }   from './data.service';
import { DbService }     from './db.service';
import { DecodedData }   from '@/models/app.interface';
import { matchesRule }   from './utils/match-rule.util';

@Injectable()
export class VerifyService {
  constructor(
    private readonly walletSvc: WalletService,
    private readonly nonceSvc: NonceService,
    private readonly discordSvc: DiscordService,
    private readonly dataSvc: DataService,
    private readonly dbSvc: DbService,
  ) {}

  async verifySignatureFlow(
    payload: DecodedData & { address?: string },
    signature: string
  ) {
    const address = await this.walletSvc.verifySignature(payload, signature);
    
    // Get the message data associated with the nonce
    const { messageId, channelId } = await this.nonceSvc.getNonceData(payload.userId);
    
    // Invalidate the nonce after retrieving the data
    await this.nonceSvc.invalidateNonce(payload.userId);
    Logger.log(`Nonce deleted for userId: ${payload.userId}`);

    // --- Message-based verification (takes precedence if messageId is present) ---
    if (messageId && channelId) {
      Logger.log(`Message-based verification for messageId: ${messageId}, channelId: ${channelId}`);
      const roleId = await this.discordSvc.getVerificationRoleId(
        payload.discordId,
        channelId,
        messageId
      );
      
      if (roleId) {
        // Check if the user owns any assets in the collection
        const assetCount = await this.dataSvc.checkAssetOwnership(address);
        Logger.log(`Message-based verification: Address ${address} owns ${assetCount} assets`);
        
        if (!assetCount || assetCount === 0) {
          await this.discordSvc.throwError(payload.nonce, 'Address does not own any assets in the collection');
          throw new Error('No matching assets for message-based verification');
        }
        
        Logger.log(`Role ID resolved from message: ${roleId}`);
        await this.discordSvc.addUserRole(
          payload.userId,
          roleId,
          payload.discordId,
          address,
          payload.nonce
        );
        await this.dbSvc.logUserRole(
          payload.userId,
          payload.discordId,
          roleId,
          address
        );
        return { message: 'Verification successful (message-based)', address };
      } else {
        Logger.warn(`No role found for messageId: ${messageId}, channelId: ${channelId}`);
      }
    }

    // --- Legacy path ---
    if (payload.role) {
      // Check if the user owns any assets in the collection
      const assetCount = await this.dataSvc.checkAssetOwnership(address);
      Logger.log(`Legacy path: Address ${address} owns ${assetCount} assets`);
      
      if (!assetCount || assetCount === 0) {
        await this.discordSvc.throwError(payload.nonce, 'Address does not own any assets in the collection');
        throw new Error('No matching assets for legacy verification');
      }
      
      const legacyRoleId = await this.dbSvc.getServerRole(payload.discordId);
      await this.discordSvc.addUserRole(
        payload.userId,
        legacyRoleId,
        payload.discordId,
        address,
        payload.nonce
      );
      await this.dbSvc.logUserRole(
        payload.userId,
        payload.discordId,
        legacyRoleId,
        address
      );
      return { message: 'Verification successful (legacy)', address };
    }

    // --- New multi-rule path ---
    const assets = await this.dataSvc.getDetailedAssets(address);
    
    // Verify the user owns at least one asset
    if (!assets || assets.length === 0) {
      Logger.log(`Multi-rule path: Address ${address} owns no assets`);
      await this.discordSvc.throwError(payload.nonce, 'Address does not own any assets in the collection');
      throw new Error('No matching assets');
    }
    
    // Only get rules for the current guild
    const rules = await this.dbSvc.getRoleMappings(
      payload.discordId
    );
    const matched = rules.filter(r => matchesRule(r, assets, channelId));
    if (!matched.length) {
      await this.discordSvc.throwError(payload.nonce, 'No matching assets');
      throw new Error('No matching assets');
    }

    for (const r of matched) {
      await this.discordSvc.addUserRole(
        payload.userId,
        r.role_id,
        payload.discordId,
        address,
        payload.nonce
      );
      await this.dbSvc.logUserRole(
        payload.userId,
        payload.discordId,
        r.role_id,
        address
      );
    }
    return { message: 'Verification successful', address };
  }
}
