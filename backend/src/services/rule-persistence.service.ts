import { Injectable, Logger } from '@nestjs/common';
import { TextChannel, Role } from 'discord.js';
import { DbService } from './db.service';
import { DiscordMessageService } from './discord-message.service';
import { AdminFeedback } from './utils/admin-feedback.util';

/**
 * Interface for rule creation data
 */
export interface RuleCreationData {
  channel: TextChannel;
  role: Role;
  slug: string;
  attributeKey: string;
  attributeValue: string;
  minItems: number;
}

/**
 * RulePersistenceService
 * 
 * Handles database operations and message management for verification rules.
 * Responsible for creating, updating, and deleting rules in the database,
 * as well as managing associated Discord messages.
 * 
 * Key responsibilities:
 * - Create verification rules in database
 * - Delete rules and associated messages
 * - Update verification messages in channels
 * - Handle rule-message associations
 */
@Injectable()
export class RulePersistenceService {
  constructor(
    private readonly dbSvc: DbService,
    private readonly messageSvc: DiscordMessageService
  ) {}

  /**
   * Creates a new verification rule and associated Discord message.
   * 
   * @param guildId - Discord guild ID
   * @param guildName - Discord guild name
   * @param ruleData - Rule creation data
   * @returns Promise<{success: boolean, ruleId?: number, messageId?: string, errorResponse?: any}> - Creation result
   */
  async createRule(
    guildId: string,
    guildName: string,
    ruleData: RuleCreationData
  ): Promise<{success: boolean, ruleId?: number, messageId?: string, errorResponse?: any}> {
    const { channel, role, slug, attributeKey, attributeValue, minItems } = ruleData;

    try {
      // Create the rule in the database
      const newRule = await this.dbSvc.addRoleMapping(
        guildId,
        guildName,
        channel.id,
        channel.name,
        slug,
        role.id,
        role.name,
        attributeKey === 'ALL' ? null : attributeKey,
        attributeValue === 'ALL' ? null : attributeValue,
        minItems
      );

      if (!newRule || !newRule.id) {
        throw new Error('Failed to create rule in database');
      }

      // Create or update verification message in the channel
      const messageResult = await this.createOrUpdateVerificationMessage(
        channel,
        newRule.id
      );

      return {
        success: true,
        ruleId: newRule.id,
        messageId: messageResult.messageId
      };
    } catch (error) {
      Logger.error('Error creating rule:', error);
      return {
        success: false,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Rule Creation Failed',
            'Failed to create the verification rule.',
            ['Please try again', 'Check server permissions']
          )]
        }
      };
    }
  }

  /**
   * Deletes a verification rule from the database.
   * 
   * @param ruleId - Rule ID to delete
   * @param guildId - Discord guild ID for verification
   * @returns Promise<void>
   */
  async deleteRule(ruleId: string, guildId: string): Promise<void> {
    try {
      await this.dbSvc.deleteRoleMapping(ruleId, guildId);
      Logger.debug(`Successfully deleted rule ${ruleId} for guild ${guildId}`);
    } catch (error) {
      Logger.error(`Failed to delete rule ${ruleId} for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Gets all verification rules for a guild (unified approach).
   * 
   * @param guildId - Discord guild ID
   * @returns Promise<any[]> - Array of rules
   */
  async getAllRules(guildId: string): Promise<any[]> {
    return await this.dbSvc.getAllRulesForServer(guildId);
  }

  /**
   * Gets legacy rules for migration purposes (now uses unified table).
   * 
   * @param guildId - Discord guild ID
   * @returns Promise<any[]> - Array of legacy rules
   */
  async getLegacyRoles(guildId: string): Promise<any[]> {
    const result = await this.dbSvc.getLegacyRoles(guildId);
    return result.data || [];
  }

  /**
   * Removes all legacy roles for a guild.
   * 
   * @param guildId - Discord guild ID
   * @returns Promise<{success: boolean, removed: any[], errorResponse?: any}> - Removal result
   */
  async removeAllLegacyRoles(guildId: string): Promise<{success: boolean, removed: any[], errorResponse?: any}> {
    try {
      const result = await this.dbSvc.removeAllLegacyRoles(guildId);
      return {
        success: true,
        removed: result.removed
      };
    } catch (error) {
      Logger.error('Error removing legacy roles:', error);
      return {
        success: false,
        removed: [],
        errorResponse: {
          content: AdminFeedback.simple('Failed to remove legacy roles. Please try again.', true)
        }
      };
    }
  }

  /**
   * Migrates a legacy role to a new rule format.
   * 
   * @param guildId - Discord guild ID
   * @param guildName - Discord guild name
   * @param channelId - Discord channel ID
   * @param channelName - Discord channel name
   * @param legacyRole - Legacy role data
   * @returns Promise<{success: boolean, ruleId?: number, errorResponse?: any}> - Migration result
   */
  async migrateLegacyRole(
    guildId: string,
    guildName: string,
    channelId: string,
    channelName: string,
    legacyRole: any
  ): Promise<{success: boolean, ruleId?: number, errorResponse?: any}> {
    try {
      const newRule = await this.dbSvc.addRoleMapping(
        guildId,
        guildName,
        channelId,
        channelName,
        'ALL', // slug
        legacyRole.role_id,
        legacyRole.name || 'Legacy Role', // role_name
        null, // attribute_key
        null, // attribute_value
        1    // min_items (set to 1 for migration)
      );

      return {
        success: true,
        ruleId: newRule.id
      };
    } catch (error) {
      Logger.error(`Error migrating legacy role ${legacyRole.role_id}:`, error);
      return {
        success: false,
        errorResponse: {
          content: AdminFeedback.simple(`Failed to migrate role ${legacyRole.role_id}`, true)
        }
      };
    }
  }

  /**
   * Creates or updates a verification message in a Discord channel.
   * 
   * @param channel - Discord channel
   * @param ruleId - Rule ID to associate with the message
   * @returns Promise<{success: boolean, messageId?: string}> - Message operation result
   */
  private async createOrUpdateVerificationMessage(
    channel: TextChannel,
    ruleId: number
  ): Promise<{success: boolean, messageId?: string}> {
    try {
      // Check for existing verification message
      const hasExistingMessage = await this.messageSvc.findExistingVerificationMessage(channel);
      
      if (hasExistingMessage) {
        // Verification message already exists, no need to create a new one
        return {
          success: true,
          messageId: 'existing' // We don't track specific message IDs anymore
        };
      }

      // Create new verification message
      const newMessageId = await this.messageSvc.createVerificationMessage(channel);

      if (newMessageId) {
        // Note: We no longer track message_id in the database for channel-based verification
        return {
          success: true,
          messageId: newMessageId
        };
      }

      return { success: false };
    } catch (error) {
      Logger.error('Error creating/updating verification message:', error);
      return { success: false };
    }
  }
}
