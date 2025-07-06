import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { NonceService }  from './nonce.service';
import { DiscordService } from './discord.service';
import { DiscordVerificationService } from './discord-verification.service';
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
    private readonly discordVerificationSvc: DiscordVerificationService,
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
      
      // Get ALL rules that match this message (not just the first one)
      const rules = await this.dbSvc.findRulesByMessageId(
        payload.discordId,
        channelId,
        messageId
      );
      
      if (!rules || rules.length === 0) {
        Logger.warn(`No rules found for messageId: ${messageId}, channelId: ${channelId}`);
        const errorMsg = 'No verification rules found for this request';
        await this.discordVerificationSvc.throwError(payload.nonce, errorMsg);
        throw new Error(errorMsg);
      }

      Logger.log(`Found ${rules.length} rules for messageId: ${messageId}`);
      
      const assignedRoles = [];
      let hasMatchingAssets = false;
      
      for (const rule of rules) {
        if (!rule.role_id) {
          Logger.warn(`Rule ${rule.id} has no role_id, skipping`);
          continue;
        }
        
        Logger.log(`Processing rule ${rule.id}: slug=${rule.slug}, attr=${rule.attribute_key}=${rule.attribute_value}, min_items=${rule.min_items}`);
        
        // Check asset ownership against the rule criteria
        const matchingAssets = await this.dataSvc.checkAssetOwnershipWithCriteria(
          address, 
          rule.slug,
          rule.attribute_key, 
          rule.attribute_value,
          rule.min_items != null ? rule.min_items : 1
        );
        
        Logger.log(`Rule ${rule.id}: Address ${address} owns ${matchingAssets} matching assets (required: ${rule.min_items != null ? rule.min_items : 1})`);
        
        const requiredMinItems = rule.min_items != null ? rule.min_items : 1;
        if (matchingAssets >= requiredMinItems) {
          hasMatchingAssets = true;
          
          try {
            Logger.log(`Assigning role: ${rule.role_id} to user: ${payload.userId}`);
            
            // Get user, guild, and role information for logging (with fallbacks)
            let user = null, guild = null, role = null;
            try {
              [user, guild, role] = await Promise.all([
                this.discordSvc.getUser(payload.userId),
                this.discordSvc.getGuild(payload.discordId),
                this.discordSvc.getRole(payload.discordId, rule.role_id)
              ]);
            } catch (discordError) {
              Logger.warn(`Discord API calls failed for role assignment:`, discordError.message);
            }
            
            await this.discordVerificationSvc.addUserRole(
              payload.userId,
              rule.role_id,
              payload.discordId,
              address,
              payload.nonce
            );
            await this.dbSvc.logUserRole(
              payload.userId,
              payload.discordId,
              rule.role_id,
              address,
              user?.username || `User-${payload.userId}`,
              guild?.name || `Guild-${payload.discordId}`,
              role?.name || `Role-${rule.role_id}`
            );
            assignedRoles.push(rule.role_id);
            Logger.log(`✅ Successfully assigned role: ${rule.role_id} for rule ${rule.id}: slug=${rule.slug}, attr=${rule.attribute_key}=${rule.attribute_value}, min_items=${rule.min_items}`);
          } catch (error) {
            Logger.error(`❌ Failed to assign role ${rule.role_id}:`, error.message);
            // Continue with other roles even if one fails
          }
        }
      }
      
      if (!hasMatchingAssets) {
        const errorMsg = rules[0]?.slug 
          ? `Address does not own the required assets for collection: ${rules[0].slug}`
          : 'Address does not own any assets in the collection';
        await this.discordVerificationSvc.throwError(payload.nonce, errorMsg);
        throw new Error(errorMsg);
      }
      
      Logger.log(`Message-based verification completed. Assigned ${assignedRoles.length} roles: ${assignedRoles.join(', ')}`);
      return { 
        message: `Verification successful (message-based) - ${assignedRoles.length} roles assigned`, 
        address,
        assignedRoles
      };
    }

    // --- Legacy path ---
    if (payload.role) {
      // Check if the user owns any assets in the collection
      const assetCount = await this.dataSvc.checkAssetOwnership(address);
      Logger.log(`Legacy path: Address ${address} owns ${assetCount} assets`);
      
      if (!assetCount || assetCount === 0) {
        const errorMsg = 'Address does not own any assets in the collection';
        await this.discordVerificationSvc.throwError(payload.nonce, errorMsg);
        throw new Error(errorMsg);
      }
      
      const legacyRoleId = await this.dbSvc.getServerRole(payload.discordId);
      Logger.log(`Legacy path: Assigning role ${legacyRoleId}`);
      
      // Get user, guild, and role information for logging (with fallbacks)
      let user = null, guild = null, role = null;
      try {
        [user, guild, role] = await Promise.all([
          this.discordSvc.getUser(payload.userId),
          this.discordSvc.getGuild(payload.discordId),
          this.discordSvc.getRole(payload.discordId, legacyRoleId)
        ]);
      } catch (discordError) {
        Logger.warn(`Discord API calls failed for legacy role assignment:`, discordError.message);
      }
      
      await this.discordVerificationSvc.addUserRole(
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
        address,
        user?.username || `User-${payload.userId}`,
        guild?.name || `Guild-${payload.discordId}`,
        role?.name || `Role-${legacyRoleId}`
      );
      Logger.log(`✅ Legacy path: Successfully assigned role: ${legacyRoleId}`);
      return { message: 'Verification successful (legacy)', address };
    }

    // --- New multi-rule path ---
    const assets = await this.dataSvc.getDetailedAssets(address);
    
    // Verify the user owns at least one asset
    if (!assets || assets.length === 0) {
      Logger.log(`Multi-rule path: Address ${address} owns no assets`);
      const errorMsg = 'Address does not own any assets in the collection';
      await this.discordVerificationSvc.throwError(payload.nonce, errorMsg);
      throw new Error(errorMsg);
    }
    
    // Only get rules for the current guild
    const rules = await this.dbSvc.getRoleMappings(
      payload.discordId
    );
    const matched = rules.filter(r => matchesRule(r, assets, channelId));
    if (!matched.length) {
      const errorMsg = 'No matching assets found for verification requirements';
      await this.discordVerificationSvc.throwError(payload.nonce, errorMsg);
      throw new Error(errorMsg);
    }

    for (const r of matched) {
      Logger.log(`Multi-rule path: Assigning role ${r.role_id} for rule ${r.id}: slug=${r.slug}, attr=${r.attribute_key}=${r.attribute_value}, min_items=${r.min_items}`);
      
      // Get user, guild, and role information for logging (with fallbacks)
      let user = null, guild = null, role = null;
      try {
        [user, guild, role] = await Promise.all([
          this.discordSvc.getUser(payload.userId),
          this.discordSvc.getGuild(payload.discordId),
          this.discordSvc.getRole(payload.discordId, r.role_id)
        ]);
      } catch (discordError) {
        Logger.warn(`Discord API calls failed for multi-rule assignment:`, discordError.message);
      }
      
      await this.discordVerificationSvc.addUserRole(
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
        address,
        user?.username || `User-${payload.userId}`,
        guild?.name || `Guild-${payload.discordId}`,
        role?.name || `Role-${r.role_id}`
      );
      Logger.log(`✅ Multi-rule path: Successfully assigned role: ${r.role_id} for rule ${r.id}: slug=${r.slug}, attr=${r.attribute_key}=${r.attribute_value}, min_items=${r.min_items}`);
    }
    return { message: 'Verification successful', address };
  }
}
