import { Injectable, Logger } from '@nestjs/common';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';

/**
 * Remove Rule Command Handler
 * 
 * Handles the complete flow for removing verification rules:
 * - Input validation and parsing (supports bulk removal)
 * - Rule existence validation  
 * - Database deletion with error handling
 * - Success/failure feedback with undo functionality
 * - Bulk operation support
 */
@Injectable()
export class RemoveRuleHandler {
  private readonly logger = new Logger(RemoveRuleHandler.name);

  // Store removed rule data for undo functionality
  private removedRules: Map<string, any> = new Map();

  constructor(
    private readonly dbSvc: DbService
  ) {}

  /**
   * Main entry point for remove rule command
   */
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const ruleIdInput = interaction.options.getString('rule_id');
    
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    if (!ruleIdInput) {
      await interaction.editReply({
        content: AdminFeedback.simple('Rule ID is required.', true)
      });
      return;
    }

    try {
      // Parse and validate rule IDs
      const ruleIds = await this.parseRuleIds(ruleIdInput);
      if (!ruleIds) {
        await interaction.editReply({
          content: AdminFeedback.simple('No valid rule IDs provided.', true)
        });
        return;
      }

      // Find and validate rules exist
      const { rulesToRemove, notFoundIds } = await this.findRulesToRemove(interaction, ruleIds);
      
      // Handle not found rules
      if (notFoundIds.length > 0) {
        const notFoundMessage = notFoundIds.length === 1 
          ? `Rule ${notFoundIds[0]} not found.`
          : `Rules ${notFoundIds.join(', ')} not found.`;
          
        if (rulesToRemove.length === 0) {
          // No valid rules to remove
          await interaction.editReply({
            content: AdminFeedback.simple(notFoundMessage, true)
          });
          return;
        } else {
          // Some valid rules, show warning but continue
          await interaction.followUp({
            content: AdminFeedback.simple(`⚠️ ${notFoundMessage}`, true),
            ephemeral: true
          });
        }
      }

      // Delete rules from database
      const deletionResults = await this.deleteRules(interaction, rulesToRemove);

      // Send appropriate feedback based on results
      await this.sendRemovalFeedback(interaction, deletionResults);

    } catch (error) {
      this.logger.error('Error in handleRemoveRule:', error);
      await interaction.editReply({
        content: AdminFeedback.simple(`Error: ${error.message}`, true)
      });
    }
  }

  /**
   * Parses comma-separated rule IDs and validates format
   */
  private async parseRuleIds(ruleIdInput: string): Promise<number[] | null> {
    try {
      // Parse comma-separated rule IDs (handle both "1,2,3" and "1, 2, 3" formats)
      const ruleIds = ruleIdInput
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => {
          const parsed = parseInt(id, 10);
          if (isNaN(parsed)) {
            throw new Error(`"${id}" is not a valid rule ID`);
          }
          return parsed;
        });

      return ruleIds.length > 0 ? ruleIds : null;
    } catch (error) {
      throw new Error(`Invalid rule ID format: ${error.message}`);
    }
  }

  /**
   * Finds rules to remove and validates they exist
   */
  private async findRulesToRemove(
    interaction: ChatInputCommandInteraction, 
    ruleIds: number[]
  ): Promise<{
    rulesToRemove: Array<{ id: number; data: any }>;
    notFoundIds: number[];
  }> {
    // Get all rules for the server
    const allRules = await this.dbSvc.getRoleMappings(interaction.guild.id);
    
    // Find rules to remove and validate they exist
    const rulesToRemove = [];
    const notFoundIds = [];
    
    for (const ruleId of ruleIds) {
      const ruleToRemove = allRules.find(rule => rule.id === ruleId);
      if (ruleToRemove) {
        rulesToRemove.push({ id: ruleId, data: ruleToRemove });
      } else {
        notFoundIds.push(ruleId);
      }
    }

    return { rulesToRemove, notFoundIds };
  }

  /**
   * Deletes rules from database and tracks results
   */
  private async deleteRules(
    interaction: ChatInputCommandInteraction,
    rulesToRemove: Array<{ id: number; data: any }>
  ): Promise<{
    successful: Array<{ id: number; data: any; success: true }>;
    failed: Array<{ id: number; data: any; success: false; error: string }>;
  }> {
    const deletionResults = [];
    
    for (const { id, data } of rulesToRemove) {
      try {
        await this.dbSvc.deleteRoleMapping(String(id), interaction.guild.id);
        deletionResults.push({ id, data, success: true });
      } catch (error) {
        deletionResults.push({ id, data, success: false, error: error.message });
      }
    }

    const successful = deletionResults.filter(r => r.success);
    const failed = deletionResults.filter(r => !r.success);

    return { successful, failed };
  }

  /**
   * Sends appropriate feedback based on deletion results
   */
  private async sendRemovalFeedback(
    interaction: ChatInputCommandInteraction,
    deletionResults: {
      successful: Array<{ id: number; data: any; success: true }>;
      failed: Array<{ id: number; data: any; success: false; error: string }>;
    }
  ): Promise<void> {
    const { successful, failed } = deletionResults;

    if (successful.length === 1 && failed.length === 0) {
      // Single successful removal
      await this.sendSingleRuleRemovedMessage(
        interaction,
        successful[0].id,
        successful[0].data
      );
    } else {
      // Multiple rules or mixed results
      await this.sendBulkRuleRemovedMessage(
        interaction,
        successful,
        failed
      );
    }
  }

  /**
   * Sends feedback for single rule removal with undo functionality
   */
  private async sendSingleRuleRemovedMessage(
    interaction: ChatInputCommandInteraction,
    ruleId: number,
    removedRuleData: any
  ): Promise<void> {
    // Store the removed rule data for undo functionality
    this.removedRules.set(interaction.id, removedRuleData);

    // Create detailed rule info fields
    const ruleInfoFields = this.createRuleInfoFields(removedRuleData);
    const embed = AdminFeedback.success(
      'Rule Removed', 
      `Rule ${ruleId} for ${removedRuleData.channel_name} and @${removedRuleData.role_name} has been removed.`
    );
    embed.addFields(ruleInfoFields);

    // Create Undo button
    const undoButton = this.createUndoRemovalButton(interaction.id, 'removal');

    await interaction.editReply({
      embeds: [embed],
      components: [undoButton]
    });

    // Set up button interaction handler for undo removal
    this.setupRemovalButtonHandler(interaction);
  }

  /**
   * Sends feedback for bulk rule removal with undo functionality
   */
  private async sendBulkRuleRemovedMessage(
    interaction: ChatInputCommandInteraction,
    successful: Array<{ id: number; data: any; success: true }>,
    failed: Array<{ id: number; data: any; success: false; error: string }>
  ): Promise<void> {
    // Store the removed rules data for undo functionality (only successful ones)
    if (successful.length > 0) {
      const bulkRemovedData = {
        rules: successful.map(s => s.data),
        isBulk: true
      };
      this.removedRules.set(interaction.id, bulkRemovedData);
    }

    // Create success message
    let description = '';
    if (successful.length > 0) {
      const ruleList = successful.map(s => `Rule ${s.id}`).join(', ');
      description += `✅ **Successfully removed:** ${ruleList}\n\n`;
      
      // Add rule details
      successful.forEach(s => {
        description += `**Rule ${s.id}:** ${s.data.channel_name} → @${s.data.role_name}\n`;
      });
    }

    if (failed.length > 0) {
      description += '\n❌ **Failed to remove:**\n';
      failed.forEach(f => {
        description += `Rule ${f.id}: ${f.error}\n`;
      });
    }

    const embed = AdminFeedback.success(
      successful.length === 1 ? 'Rule Removed' : `${successful.length} Rules Removed`, 
      description.trim()
    );

    const components = [];
    if (successful.length > 0) {
      // Create Undo button for successful removals
      const undoButton = this.createUndoRemovalButton(interaction.id, 'removal');
      components.push(undoButton);
    }

    await interaction.editReply({
      embeds: [embed],
      components
    });

    // Set up button interaction handler for undo removal (only if there are successful removals)
    if (successful.length > 0) {
      this.setupRemovalButtonHandler(interaction);
    }
  }

  /**
   * Creates detailed rule information fields for consistent display
   */
  private createRuleInfoFields(ruleData: any): any[] {
    const formatAttribute = (key: string, value: string) => {
      if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
      if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
      if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
      return 'ALL';
    };

    return [
      {
        name: 'Collection',
        value: ruleData.slug || 'ALL',
        inline: true
      },
      {
        name: 'Attribute',
        value: formatAttribute(ruleData.attribute_key || 'ALL', ruleData.attribute_value || 'ALL'),
        inline: true
      },
      {
        name: 'Min Items',
        value: (ruleData.min_items || 1).toString(),
        inline: true
      }
    ];
  }

  /**
   * Creates Undo action button for rule removal messages
   */
  private createUndoRemovalButton(interactionId: string, type: 'removal' | 'cancellation') {
    return {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          custom_id: `undo_${type}_${interactionId}`,
          label: 'Undo',
          style: 2, // Secondary
          emoji: { name: '↩️' }
        }
      ]
    };
  }

  /**
   * Sets up button interaction handler for removal undo messages
   */
  private setupRemovalButtonHandler(interaction: ChatInputCommandInteraction): void {
    // TODO: This will be implemented in the interaction handler phase
    // For now, we'll create a placeholder that logs the setup
    this.logger.debug(`Setting up removal button handler for interaction ${interaction.id}`);
    
    // The actual implementation will be moved to UndoInteractionHandler
    // This includes:
    // - Button click detection
    // - Rule restoration logic
    // - Role recreation if needed
    // - Feedback messages
  }

  /**
   * Gets stored removal data for undo functionality
   */
  getRemovedRuleData(interactionId: string): any {
    return this.removedRules.get(interactionId);
  }

  /**
   * Clears stored removal data
   */
  clearRemovedRuleData(interactionId: string): void {
    this.removedRules.delete(interactionId);
  }
}
