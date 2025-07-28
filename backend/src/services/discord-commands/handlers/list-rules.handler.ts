import { Injectable, Logger } from '@nestjs/common';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';
import { formatAttribute } from '../utils/rule-validation.util';

/**
 * List Rules Command Handler
 * 
 * Handles the complete flow for listing verification rules:
 * - Retrieval of all server rules
 * - Filtering and sorting by rule ID
 * - Formatted display with channel/role references
 * - Proper handling of empty rule sets
 */
@Injectable()
export class ListRulesHandler {
  private readonly logger = new Logger(ListRulesHandler.name);

  constructor(
    private readonly dbSvc: DbService
  ) {}

  /**
   * Main entry point for list rules command
   */
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      // Defer the reply early to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      this.logger.log(`Fetching rules for server: ${interaction.guild.id}`);
      
      // Get all verification rules for the server
      const allRules = await this.dbSvc.getRoleMappings(interaction.guild.id);
      
      this.logger.log(`Found ${allRules?.length || 0} total rules`);
      
      const rules = this.filterAndSortRules(allRules);
      
      this.logger.log(`Filtered to ${rules?.length || 0} rules`);
      
      // Format and send the rules list
      const description = this.formatRulesList(rules);
      
      this.logger.log(`Description length: ${description?.length || 0}`);
      this.logger.log(`Description preview: ${description?.substring(0, 100)}...`);
      
      // Validate description length (Discord embed limit is 4096 characters)
      const validatedDescription = this.validateDescription(description);
      
      await interaction.editReply({
        embeds: [AdminFeedback.info('Verification Rules', validatedDescription)]
      });

    } catch (error) {
      this.logger.error('Error in handleListRules:');
      this.logger.error('Error details:', error);
      this.logger.error('Error stack:', error.stack);
      this.logger.error('Error message:', error.message);
      this.logger.error('Error type:', typeof error);
      this.logger.error('Error constructor:', error.constructor?.name);
      
      const errorMessage = `Error retrieving rules: ${error?.message || error?.toString() || 'Unknown error'}`;
      if (interaction.deferred) {
        await interaction.editReply({
          content: AdminFeedback.simple(errorMessage, true)
        });
      } else {
        await interaction.reply({
          content: AdminFeedback.simple(errorMessage, true),
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }

  /**
   * Filters out system rules and sorts by rule ID
   */
  private filterAndSortRules(allRules: any[]): any[] {
    return allRules
      .filter(rule => rule.server_id !== '000000000000000000')
      .sort((a, b) => a.id - b.id); // Sort by Rule ID in ascending order
  }

  /**
   * Formats the rules list for display
   */
  private formatRulesList(rules: any[]): string {
    if (rules.length === 0) {
      return 'No verification rules found.';
    }

    return rules.map(rule => this.formatSingleRule(rule)).join('\n\n');
  }

  /**
   * Formats a single rule for display
   */
  private formatSingleRule(rule: any): string {
    if (!rule) {
      return 'Invalid rule data';
    }

    try {
      const attribute = formatAttribute(rule.attribute_key, rule.attribute_value);
      const slug = rule.slug || 'ALL';
      const minItems = rule.min_items || 1;
      const ruleId = rule.id || 'N/A';
      const channelId = rule.channel_id || 'N/A';
      const roleId = rule.role_id || 'N/A';

      return `ID: ${ruleId} | Channel: <#${channelId}> | Role: <@&${roleId}> | Slug: ${slug} | Attr: ${attribute} | Min: ${minItems}`;
    } catch (error) {
      this.logger.warn('Error formatting rule:', rule, error);
      return `ID: ${rule.id || 'N/A'} | Error formatting rule data`;
    }
  }

  /**
   * Validates and truncates description to fit Discord embed limits
   */
  private validateDescription(description: string): string {
    if (!description) {
      return 'No verification rules found.';
    }

    // Discord embed description limit is 4096 characters
    const MAX_LENGTH = 4096;
    
    if (description.length <= MAX_LENGTH) {
      return description;
    }

    // Truncate and add truncation notice
    const truncated = description.substring(0, MAX_LENGTH - 100);
    const lastNewline = truncated.lastIndexOf('\n\n');
    
    // Cut at last complete rule if possible
    const finalDescription = lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated;
    
    return `${finalDescription}\n\n... (truncated - showing first ${finalDescription.split('\n\n').length} rules)`;
  }
}
