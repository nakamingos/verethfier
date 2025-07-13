import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DbService } from './db.service';
import { DataService } from './data.service';
import { DiscordVerificationService } from './discord-verification.service';
import { DiscordService } from './discord.service';
import { EnvironmentConfig } from '@/config/environment.config';

/**
 * DynamicRoleService
 * 
 * Handles continuous monitoring and automatic role management for token-gated Discord servers.
 * Provides both scheduled re-verification and on-demand role sync capabilities.
 * 
 * Key Features:
 * - Scheduled re-verification of all active role assignments
 * - Automatic role removal when holdings no longer meet criteria
 * - Configurable verification intervals per rule
 * - Graceful handling of Discord API rate limits
 * - Detailed logging and metrics for monitoring
 */
@Injectable()
export class DynamicRoleService {
  constructor(
    private readonly dbSvc: DbService,
    private readonly dataSvc: DataService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    private readonly discordSvc: DiscordService,
  ) {
    Logger.log(`🔄 DynamicRoleService initialized with CRON schedule: ${EnvironmentConfig.DYNAMIC_ROLE_CRON}`);
  }

  /**
   * Main scheduled task - runs based on DYNAMIC_ROLE_CRON environment variable
   * Re-verifies all active role assignments
   */
  @Cron(EnvironmentConfig.DYNAMIC_ROLE_CRON)
  async performScheduledReverification() {
    Logger.log('🔄 Starting scheduled role re-verification');
    
    try {
      const activeAssignments = await this.getActiveRoleAssignments();
      Logger.log(`Found ${activeAssignments.length} active role assignments to verify`);
      
      let verifiedCount = 0;
      let revokedCount = 0;
      let errorCount = 0;

      // Process in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < activeAssignments.length; i += batchSize) {
        const batch = activeAssignments.slice(i, i + batchSize);
        
        for (const assignment of batch) {
          // Skip null or undefined assignments
          if (!assignment) {
            Logger.debug('Skipping null or undefined assignment');
            continue;
          }
          
          try {
            const stillQualifies = await this.verifyUserStillQualifies(assignment);
            
            if (stillQualifies) {
              await this.updateLastVerified(assignment.id);
              verifiedCount++;
              Logger.debug(`✅ User ${assignment.user_id} still qualifies for role ${assignment.role_id}`);
            } else {
              await this.revokeRole(assignment);
              revokedCount++;
              Logger.log(`🚫 Revoked role ${assignment.role_name || assignment.role_id} from user ${assignment.user_name || assignment.user_id}`);
            }
          } catch (error) {
            Logger.error(`Error verifying assignment ${assignment.id}:`, error.message);
            errorCount++;
          }
        }
        
        // Rate limiting: small delay between batches
        if (i + batchSize < activeAssignments.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      Logger.log(`🏁 Re-verification complete: ${verifiedCount} verified, ${revokedCount} revoked, ${errorCount} errors`);
      
    } catch (error) {
      Logger.error('Failed to perform scheduled re-verification:', error);
    }
  }

  /**
   * Manual re-verification for a specific user across all servers
   */
  async reverifyUser(userId: string): Promise<{verified: number, revoked: number}> {
    Logger.log(`🔍 Manual re-verification for user ${userId}`);
    
    const userAssignments = await this.getUserActiveAssignments(userId);
    let verified = 0;
    let revoked = 0;

    for (const assignment of userAssignments) {
      try {
        const stillQualifies = await this.verifyUserStillQualifies(assignment);
        
        if (stillQualifies) {
          await this.updateLastVerified(assignment.id);
          verified++;
        } else {
          await this.revokeRole(assignment);
          revoked++;
        }
      } catch (error) {
        Logger.error(`Error during manual re-verification:`, error.message);
      }
    }

    Logger.log(`Manual re-verification complete for user ${userId}: ${verified} verified, ${revoked} revoked`);
    return { verified, revoked };
  }

  /**
   * Re-verify all users for a specific rule (when rule criteria changes)
   */
  async reverifyRule(ruleId: string): Promise<void> {
    Logger.log(`🔍 Re-verifying all assignments for rule ${ruleId}`);
    
    const ruleAssignments = await this.getRuleActiveAssignments(ruleId);
    
    for (const assignment of ruleAssignments) {
      try {
        const stillQualifies = await this.verifyUserStillQualifies(assignment);
        
        if (!stillQualifies) {
          await this.revokeRole(assignment);
          Logger.log(`Revoked role from user ${assignment.user_id} due to rule change`);
        }
      } catch (error) {
        Logger.error(`Error re-verifying rule assignment:`, error.message);
      }
    }
  }

  /**
   * Get all active role assignments that need verification
   */
  private async getActiveRoleAssignments(): Promise<any[]> {
    // This would query your enhanced tracking table
    // Return assignments that are active and either:
    // - Never been re-verified (last_checked is old)
    // - Or are past their expires_at
    
    return this.dbSvc.getActiveRoleAssignments();
  }

  /**
   * Verify if a user still qualifies for their assigned role
   */
  private async verifyUserStillQualifies(assignment: any): Promise<boolean> {
    try {
      Logger.debug(`Checking assignment: user=${assignment.user_id}, role=${assignment.role_id}, rule_id=${assignment.rule_id}, address=${assignment.address}`);
      
      // If no rule_id, we can't verify ownership criteria, so be conservative and keep the role
      if (!assignment.rule_id) {
        Logger.log(`⚠️ Assignment ${assignment.id} has no rule_id, keeping role conservatively`);
        return true;
      }

      // Get the rule details
      const rule = await this.dbSvc.getRuleById(assignment.rule_id);
      if (!rule) {
        Logger.warn(`Rule ${assignment.rule_id} not found, revoking assignment`);
        return false;
      }

      Logger.debug(`Rule found: slug=${rule.slug}, attr=${rule.attribute_key}=${rule.attribute_value}, min_items=${rule.min_items}`);

      // Debug: log the exact parameters being checked
      Logger.log(`🔍 Checking asset ownership for assignment ${assignment.id}:`);
      Logger.log(`   - Address: ${assignment.address}`);
      Logger.log(`   - Rule ID: ${assignment.rule_id}`);
      Logger.log(`   - Collection (slug): ${rule.slug}`);
      Logger.log(`   - Attribute: ${rule.attribute_key}=${rule.attribute_value}`);
      Logger.log(`   - Min required: ${rule.min_items || 1}`);

      // Check current asset ownership
      const matchingAssets = await this.dataSvc.checkAssetOwnershipWithCriteria(
        assignment.address,
        rule.slug,
        rule.attribute_key,
        rule.attribute_value,
        rule.min_items || 1
      );

      const requiredMinItems = rule.min_items || 1;
      const stillQualifies = matchingAssets >= requiredMinItems;

      Logger.log(`🔍 User ${assignment.user_id} owns ${matchingAssets}/${requiredMinItems} assets for rule ${rule.id}: ${stillQualifies ? 'QUALIFIED ✅' : 'NOT QUALIFIED ❌'}`);
      
      return stillQualifies;
      
    } catch (error) {
      Logger.error(`Error checking qualification:`, error.message);
      // In case of API errors, be conservative and don't revoke
      return true;
    }
  }

  /**
   * Revoke a role from Discord and update database
   */
  private async revokeRole(assignment: any): Promise<void> {
    try {
      // Remove role from Discord
      await this.discordVerificationSvc.removeUserRole(
        assignment.user_id,
        assignment.server_id,
        assignment.role_id
      );

      // Update database status
      await this.dbSvc.updateRoleAssignmentStatus(assignment.id, 'revoked');
      
      Logger.log(`Successfully revoked role ${assignment.role_id} from user ${assignment.user_id}`);
      
    } catch (error) {
      Logger.error(`Failed to revoke role:`, error.message);
      // Mark as expired if Discord removal fails
      await this.dbSvc.updateRoleAssignmentStatus(assignment.id, 'expired');
    }
  }

  /**
   * Update last verified timestamp
   */
  private async updateLastVerified(assignmentId: string): Promise<void> {
    await this.dbSvc.updateLastVerified(assignmentId);
  }

  /**
   * Get active assignments for a specific user
   */
  private async getUserActiveAssignments(userId: string): Promise<any[]> {
    return this.dbSvc.getUserActiveAssignments(userId);
  }

  /**
   * Get active assignments for a specific rule
   */
  private async getRuleActiveAssignments(ruleId: string): Promise<any[]> {
    return this.dbSvc.getRuleActiveAssignments(ruleId);
  }

  /**
   * Get comprehensive stats about role assignments
   */
  async getRoleAssignmentStats(): Promise<any> {
    return {
      totalActive: await this.dbSvc.countActiveAssignments(),
      totalRevoked: await this.dbSvc.countRevokedAssignments(),
      expiringSoon: await this.dbSvc.countExpiringSoonAssignments(),
      lastReverificationRun: await this.dbSvc.getLastReverificationTime(),
    };
  }

  /**
   * TEST METHOD: Manually test asset ownership checking
   */
  async testAssetOwnership(address: string, slug: string, attributeKey: string, attributeValue: string, minItems: number): Promise<void> {
    Logger.log(`🧪 Testing asset ownership for address: ${address}`);
    Logger.log(`🧪 Rule criteria: slug=${slug}, attributeKey=${attributeKey}, attributeValue=${attributeValue}, minItems=${minItems}`);
    
    try {
      const matchingAssets = await this.dataSvc.checkAssetOwnershipWithCriteria(
        address,
        slug,
        attributeKey,
        attributeValue,
        minItems
      );
      
      Logger.log(`🧪 Result: ${matchingAssets} matching assets found`);
      Logger.log(`🧪 Qualifies: ${matchingAssets >= minItems ? 'YES' : 'NO'}`);
      
    } catch (error) {
      Logger.error(`🧪 Test failed:`, error.message);
    }
  }
}
