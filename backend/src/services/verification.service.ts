import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import { DataService } from './data.service';
import { DiscordVerificationService } from './discord-verification.service';
import { VerifierRole } from '@/models/verifier-role.interface';
import { DecodedData } from '@/models/app.interface';

/**
 * VerificationService
 * 
 * Unified verification service that handles all verification logic for both legacy and modern rules.
 * This service consolidates verification logic and eliminates the need for separate legacy table queries.
 * 
 * Key responsibilities:
 * - Handle verification based on rule.slug to determine verification type
 * - Process both legacy (migrated) and modern rules uniformly
 * - Manage role assignments through the unified verifier_user_roles table
 * - Provide asset ownership verification against verification rules
 * 
 * Rule Types:
 * - Modern rules: Have specific slug, attribute_key, attribute_value, min_items
 * - Legacy rules: Use special slug 'legacy_collection' for migrated legacy users
 */
@Injectable()
export class VerificationService {
  constructor(
    private readonly dbSvc: DbService,
    private readonly dataSvc: DataService,
    private readonly discordVerificationSvc: DiscordVerificationService,
  ) {}

  /**
   * Verify a user's assets against a specific verification rule
   */
  async verifyUserAgainstRule(
    address: string,
    rule: VerifierRole
  ): Promise<{ isValid: boolean; matchingAssetCount?: number }> {
    try {
      // Handle legacy rules specially
      if (this.isLegacyRule(rule)) {
        return await this.verifyLegacyRule(address, rule);
      }

      // Handle modern rules with specific criteria
      return await this.verifyModernRule(address, rule);
    } catch (error) {
      Logger.error(`Error verifying user against rule ${rule.id}:`, error);
      return { isValid: false };
    }
  }

  /**
   * Verify a user against multiple rules (e.g., for a specific message or channel)
   */
  async verifyUserAgainstRules(
    address: string,
    rules: VerifierRole[]
  ): Promise<{ validRules: VerifierRole[]; invalidRules: VerifierRole[]; matchingAssetCounts: Map<string, number> }> {
    const validRules: VerifierRole[] = [];
    const invalidRules: VerifierRole[] = [];
    const matchingAssetCounts = new Map<string, number>();

    for (const rule of rules) {
      const result = await this.verifyUserAgainstRule(address, rule);
      
      if (result.isValid) {
        validRules.push(rule);
        if (result.matchingAssetCount) {
          matchingAssetCounts.set(rule.id.toString(), result.matchingAssetCount);
        }
      } else {
        invalidRules.push(rule);
      }
    }

    return { validRules, invalidRules, matchingAssetCounts };
  }

  /**
   * Get all rules for a server (unified approach - no legacy table queries)
   */
  async getAllRulesForServer(serverId: string): Promise<VerifierRole[]> {
    return await this.dbSvc.getRoleMappings(serverId);
  }

  /**
   * Get rules for a specific channel
   */
  async getRulesForChannel(serverId: string, channelId: string): Promise<VerifierRole[]> {
    return await this.dbSvc.getRulesByChannel(serverId, channelId);
  }

  /**
   * Get rules by message ID
   */
  async getRulesByMessageId(serverId: string, channelId: string, messageId: string): Promise<VerifierRole[]> {
    return await this.dbSvc.findRulesByMessageId(serverId, channelId, messageId);
  }

  /**
   * Assign role to user based on verification result
   */
  async assignRoleToUser(
    userId: string,
    serverId: string,
    roleId: string,
    address: string,
    ruleId?: string,
    metadata?: any
  ): Promise<void> {
    // Log the role assignment with enhanced metadata
    await this.dbSvc.logUserRole(
      userId,
      serverId,
      roleId,
      address,
      metadata?.userName,
      metadata?.serverName,
      metadata?.roleName
    );

    Logger.debug(`Role ${roleId} assigned to user ${userId} in server ${serverId}`);
  }

  /**
   * Check if a rule is a legacy rule (migrated from old system)
   */
  private isLegacyRule(rule: VerifierRole): boolean {
    return rule.slug === 'legacy_collection' || 
           rule.attribute_key === 'legacy_attribute' ||
           (typeof rule.id === 'string' && rule.id === 'LEGACY'); // For backwards compatibility
  }

  /**
   * Verify against legacy rule (uses broader asset ownership check)
   */
  private async verifyLegacyRule(
    address: string,
    rule: VerifierRole
  ): Promise<{ isValid: boolean; matchingAssetCount?: number }> {
    Logger.debug(`Verifying legacy rule for address: ${address}`);
    
    // For legacy rules, check ownership of any assets (ALL collections)
    try {
      const assetCount = await this.dataSvc.checkAssetOwnershipWithCriteria(
        address,
        'ALL', // Check all collections for legacy users
        'ALL', // All attributes
        'ALL', // All values
        1      // At least 1 asset
      );

      const isValid = assetCount > 0;
      
      Logger.debug(`Legacy verification result for ${address}: ${isValid ? 'valid' : 'invalid'} (${assetCount} assets)`);
      
      return {
        isValid,
        matchingAssetCount: assetCount
      };
    } catch (error) {
      Logger.error(`Error in legacy verification for ${address}:`, error);
      return { isValid: false };
    }
  }

  /**
   * Verify against modern rule with specific criteria
   */
  private async verifyModernRule(
    address: string,
    rule: VerifierRole
  ): Promise<{ isValid: boolean; matchingAssetCount?: number }> {
    Logger.debug(`Verifying modern rule ${rule.id} for address: ${address}`);
    Logger.debug(`Rule criteria: slug=${rule.slug}, attr=${rule.attribute_key}=${rule.attribute_value}, min_items=${rule.min_items}`);
    
    try {
      const assetCount = await this.dataSvc.checkAssetOwnershipWithCriteria(
        address,
        rule.slug || 'ALL',
        rule.attribute_key || 'ALL',
        rule.attribute_value || 'ALL',
        rule.min_items || 1
      );

      const isValid = assetCount >= (rule.min_items || 1);
      
      Logger.debug(`Modern verification result for rule ${rule.id}: ${isValid ? 'valid' : 'invalid'} (${assetCount} assets, need ${rule.min_items || 1})`);
      
      return {
        isValid,
        matchingAssetCount: assetCount
      };
    } catch (error) {
      Logger.error(`Error in modern verification for rule ${rule.id}:`, error);
      return { isValid: false };
    }
  }

  /**
   * Get user's current role assignments for a server
   */
  async getUserRoleAssignments(userId: string, serverId: string): Promise<any[]> {
    return await this.dbSvc.getUserRoleHistory(userId, serverId);
  }

  /**
   * Revoke a role assignment
   */
  async revokeRoleAssignment(assignmentId: string): Promise<void> {
    await this.dbSvc.updateRoleVerification(assignmentId, false);
  }

  /**
   * Get active role assignments that need re-verification
   */
  async getActiveRoleAssignments(): Promise<any[]> {
    return await this.dbSvc.getActiveRoleAssignments();
  }

  /**
   * Re-verify a specific role assignment
   */
  async reverifyRoleAssignment(assignment: any): Promise<{ stillValid: boolean; updatedAssignment?: any }> {
    try {
      // Get the associated rule
      const rule = await this.dbSvc.getRuleById(assignment.rule_id);
      if (!rule) {
        Logger.warn(`Rule not found for assignment ${assignment.id}, marking as invalid`);
        const updatedAssignment = await this.dbSvc.updateRoleVerification(assignment.id, false);
        return { stillValid: false, updatedAssignment };
      }

      // Verify the user still meets the criteria
      const result = await this.verifyUserAgainstRule(assignment.address, rule);
      
      // Update the assignment status
      const updatedAssignment = await this.dbSvc.updateRoleVerification(assignment.id, result.isValid);
      
      return { stillValid: result.isValid, updatedAssignment };
    } catch (error) {
      Logger.error(`Error re-verifying assignment ${assignment.id}:`, error);
      const updatedAssignment = await this.dbSvc.updateRoleVerification(assignment.id, false);
      return { stillValid: false, updatedAssignment };
    }
  }

  /**
   * Check if a rule exists for given criteria
   */
  async ruleExists(serverId: string, channelId: string, roleId: string, slug: string): Promise<boolean> {
    return await this.dbSvc.ruleExists(serverId, channelId, roleId, slug);
  }

  /**
   * Create a new verification rule
   */
  async createRule(ruleData: {
    serverId: string;
    serverName: string;
    channelId: string;
    channelName: string;
    roleId: string;
    roleName: string;
    slug: string;
    attributeKey?: string;
    attributeValue?: string;
    minItems?: number;
  }): Promise<any> {
    return await this.dbSvc.addRoleMapping(
      ruleData.serverId,
      ruleData.serverName,
      ruleData.channelId,
      ruleData.channelName,
      ruleData.slug,
      ruleData.roleId,
      ruleData.roleName,
      ruleData.attributeKey,
      ruleData.attributeValue,
      ruleData.minItems
    );
  }

  /**
   * Delete a verification rule
   */
  async deleteRule(ruleId: string, serverId: string): Promise<void> {
    return await this.dbSvc.deleteRoleMapping(ruleId, serverId);
  }

  /**
   * Find rule with message for a channel
   */
  async findRuleWithMessage(serverId: string, channelId: string): Promise<VerifierRole | null> {
    return await this.dbSvc.findRuleWithMessage(serverId, channelId);
  }

  /**
   * Update rule message ID
   */
  async updateRuleMessageId(ruleId: number, messageId: string): Promise<void> {
    return await this.dbSvc.updateRuleMessageId(ruleId, messageId);
  }

  /**
   * Check for duplicate rules
   */
  async checkForDuplicateRule(
    serverId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    excludeRoleId?: string
  ): Promise<any> {
    return await this.dbSvc.checkForDuplicateRule(
      serverId,
      channelId,
      slug,
      attributeKey,
      attributeValue,
      minItems,
      excludeRoleId
    );
  }
}
