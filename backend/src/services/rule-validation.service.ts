import { Injectable, Logger } from '@nestjs/common';
import { ChatInputCommandInteraction, TextChannel, Guild } from 'discord.js';
import { DbService } from './db.service';
import { AdminFeedback } from './utils/admin-feedback.util';

/**
 * RuleValidationService
 * 
 * Handles validation logic for Discord verification rules.
 * Responsible for checking prerequisites, validating inputs,
 * and ensuring rule creation requirements are met.
 * 
 * Key responsibilities:
 * - Legacy rule validation and migration checks
 * - Input parameter validation
 * - Duplicate rule detection
 * - Prerequisite enforcement
 */
@Injectable()
export class RuleValidationService {
  constructor(private readonly dbSvc: DbService) {}

  /**
   * Validates that a guild can create new rules by checking for legacy rules.
   * Legacy rules must be migrated or removed before new rules can be created.
   * 
   * @param guildId - Discord guild ID to check
   * @returns Promise<{valid: boolean, errorResponse?: any}> - Validation result
   */
  async validateLegacyRuleStatus(guildId: string): Promise<{valid: boolean, errorResponse?: any}> {
    const legacyRolesResult = await this.dbSvc.getLegacyRoles(guildId);
    const legacyRoles = legacyRolesResult.data;
    
    if (legacyRoles && legacyRoles.length > 0) {
      return {
        valid: false,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Legacy Rules Exist',
            'You must migrate or remove the legacy rule(s) for this server before adding new rules.',
            [
              'Use `/setup migrate-legacy-rule` to migrate legacy rules',
              'Use `/setup remove-legacy-rule` to remove legacy rules'
            ]
          )]
        }
      };
    }

    return { valid: true };
  }

  /**
   * Validates basic input parameters for rule creation.
   * 
   * @param channel - Discord channel for the rule
   * @param roleName - Name of the role to assign
   * @returns Promise<{valid: boolean, errorResponse?: any}> - Validation result
   */
  async validateBasicInputs(
    channel: TextChannel | null, 
    roleName: string | null
  ): Promise<{valid: boolean, errorResponse?: any}> {
    if (!channel || !roleName) {
      return {
        valid: false,
        errorResponse: {
          content: AdminFeedback.simple('Channel and role are required.', true)
        }
      };
    }

    return { valid: true };
  }

  /**
   * Checks for exact duplicate rules (same criteria and role).
   * 
   * @param guildId - Discord guild ID
   * @param channelId - Discord channel ID
   * @param slug - Collection slug
   * @param attributeKey - Asset attribute key
   * @param attributeValue - Asset attribute value
   * @param minItems - Minimum items required
   * @param roleId - Discord role ID
   * @returns Promise<{isDuplicate: boolean, errorResponse?: any}> - Duplicate check result
   */
  async checkForExactDuplicate(
    guildId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    roleId: string
  ): Promise<{isDuplicate: boolean, errorResponse?: any}> {
    const exactDuplicate = await this.dbSvc.checkForExactDuplicateRule(
      guildId,
      channelId,
      slug,
      attributeKey,
      attributeValue,
      minItems,
      roleId
    );

    if (exactDuplicate) {
      return {
        isDuplicate: true,
        errorResponse: {
          embeds: [AdminFeedback.error(
            'Exact Duplicate Rule',
            'This exact rule already exists!',
            [
              'Use different criteria (collection, attribute, or min items)',
              'Remove the existing rule first with `/setup remove-rule`',
              'Check existing rules with `/setup list-rules`'
            ],
            [{
              name: 'Existing Rule',
              value: AdminFeedback.formatRule(exactDuplicate),
              inline: false
            }]
          )]
        }
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Checks for duplicate rules with different roles.
   * 
   * @param guildId - Discord guild ID
   * @param channelId - Discord channel ID
   * @param slug - Collection slug
   * @param attributeKey - Asset attribute key
   * @param attributeValue - Asset attribute value
   * @param minItems - Minimum items required
   * @param roleId - Discord role ID to exclude from check
   * @returns Promise<{isDuplicate: boolean, existingRule?: any}> - Duplicate check result
   */
  async checkForDuplicateWithDifferentRole(
    guildId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    roleId: string
  ): Promise<{isDuplicate: boolean, existingRule?: any}> {
    const existingRule = await this.dbSvc.checkForDuplicateRule(
      guildId,
      channelId,
      slug,
      attributeKey,
      attributeValue,
      minItems,
      roleId
    );

    return {
      isDuplicate: !!existingRule,
      existingRule
    };
  }

  /**
   * Validates rule removal request.
   * 
   * @param ruleId - Rule ID to remove
   * @param guildId - Discord guild ID
   * @returns Promise<{valid: boolean, errorResponse?: any}> - Validation result
   */
  async validateRuleRemoval(ruleId: string, guildId: string): Promise<{valid: boolean, errorResponse?: any}> {
    if (!ruleId) {
      return {
        valid: false,
        errorResponse: {
          content: AdminFeedback.simple('Rule ID is required.', true)
        }
      };
    }

    // Additional validation could be added here (e.g., rule exists, user permissions)
    return { valid: true };
  }
}
