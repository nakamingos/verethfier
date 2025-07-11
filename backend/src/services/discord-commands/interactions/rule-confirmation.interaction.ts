import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';
import { RemovalUndoInteractionHandler } from './removal-undo.interaction';
import { DuplicateRuleConfirmationInteractionHandler } from './duplicate-rule-confirmation.interaction';

/**
 * Rule Confirmation Interaction Handler
 * 
 * Handles all button interactions related to rule confirmation,
 * including undo functionality for created rules.
 */
@Injectable()
export class RuleConfirmationInteractionHandler {
  private readonly logger = new Logger(RuleConfirmationInteractionHandler.name);

  // Store confirmation data for Edit and Undo functionality
  private confirmationData: Map<string, any> = new Map();
  private removedRules = new Map<string, any>();
  private removedRulesForUndo: Map<string, any> = new Map(); // For passing to RemovalUndoInteractionHandler

  constructor(
    private readonly dbSvc: DbService,
    @Inject(forwardRef(() => RemovalUndoInteractionHandler))
    private readonly removalUndoHandler: RemovalUndoInteractionHandler,
    @Inject(forwardRef(() => DuplicateRuleConfirmationInteractionHandler))
    private readonly duplicateRuleConfirmationHandler: DuplicateRuleConfirmationInteractionHandler
  ) {}

  /**
   * Store confirmation data for a rule creation
   */
  storeConfirmationData(interactionId: string, data: any): void {
    this.confirmationData.set(interactionId, data);
  }

  /**
   * Get confirmation data for an interaction
   */
  getConfirmationData(interactionId: string): any {
    return this.confirmationData.get(interactionId);
  }

  /**
   * Clear confirmation data for an interaction
   */
  clearConfirmationData(interactionId: string): void {
    this.confirmationData.delete(interactionId);
  }

  /**
   * Creates action buttons for rule confirmation messages
   */
  createConfirmationButtons(interactionId: string): any {
    return {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          custom_id: `undo_rule_${interactionId}`,
          label: 'Undo',
          style: 4, // Danger
          emoji: { name: '↩️' }
        }
      ]
    };
  }

  /**
   * Sets up button interaction handler for confirmation messages
   */
  setupConfirmationButtonHandler(interaction: ChatInputCommandInteraction): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_rule_') && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_rule_')) {
        await this.handleUndoRule(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up confirmation data
        this.confirmationData.delete(interaction.id);
      }
    });
  }

  /**
   * Handles Undo button interaction - removes the rule and shows removal message
   */
  private async handleUndoRule(interaction: any): Promise<void> {
    const interactionId = interaction.customId.replace('undo_rule_', '');
    const confirmationInfo = this.confirmationData.get(interactionId);
    
    if (!confirmationInfo) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Use `/setup remove-rule` if needed.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Get the rule data before deletion for potential future undo
      const allRules = await this.dbSvc.getRoleMappings(confirmationInfo.serverId);
      const ruleToRemove = allRules?.find(rule => rule.id === confirmationInfo.ruleId);
      
      let removedRuleWithMetadata = null;
      if (ruleToRemove) {
        // Store for potential undo of this removal, including wasNewlyCreated flag
        removedRuleWithMetadata = {
          ...ruleToRemove,
          wasNewlyCreated: confirmationInfo.wasNewlyCreated
        };
        // Use the original interaction ID to maintain the chain
        this.removedRules.set(interactionId, removedRuleWithMetadata);
      }

      // Delete the rule from the database
      await this.dbSvc.deleteRoleMapping(confirmationInfo.ruleId.toString(), confirmationInfo.serverId);
      
      // If this rule involved creating a new role, try to clean it up
      if (confirmationInfo.wasNewlyCreated && ruleToRemove) {
        await this.cleanupNewlyCreatedRole(interaction, ruleToRemove.role_id, confirmationInfo.serverId);
      }
      
      // Create rule info fields for the removed rule
      const ruleInfoFields = this.duplicateRuleConfirmationHandler.createRuleInfoFields({
        rule_id: ruleToRemove.id,
        role_id: ruleToRemove.role_id,
        role_name: ruleToRemove.role_name,
        channel_name: ruleToRemove.channel_name,
        slug: ruleToRemove.slug,
        attribute_key: ruleToRemove.attribute_key,
        attribute_value: ruleToRemove.attribute_value,
        min_items: ruleToRemove.min_items
      });
      const embed = AdminFeedback.success('Rule Removed', `Rule ${ruleToRemove.id} for ${ruleToRemove.channel_name} and @${ruleToRemove.role_name} has been removed.`);
      embed.addFields(ruleInfoFields);
      
      await interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`undo_removal_${interactionId}`) // Use original ID to maintain chain
                .setLabel('Undo')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('↩️')
            )
        ],
        ephemeral: true
      });

      // Set up removal undo handler for the "Rule Removed" message
      if (removedRuleWithMetadata) {
        // Store in the dedicated map for undo functionality using original ID
        this.removedRulesForUndo.clear(); // Clear any previous data
        this.removedRulesForUndo.set(interactionId, removedRuleWithMetadata);
        this.removalUndoHandler.setupRemovalButtonHandler(interaction, this.removedRulesForUndo);
      }

      // Clean up the confirmation data
      this.confirmationData.delete(interactionId);
    } catch (error) {
      this.logger.error('Error undoing rule creation:', error);
      
      // Only try to respond if we haven't already responded and the interaction is still valid
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: AdminFeedback.simple(`Error undoing rule: ${error.message}`, true),
            ephemeral: true
          });
        } else if (interaction.replied) {
          // Use followUp if already replied
          await interaction.followUp({
            content: AdminFeedback.simple(`Error undoing rule: ${error.message}`, true),
            ephemeral: true
          });
        }
      } catch (responseError) {
        // If we can't respond to the interaction, just log it
        this.logger.error('Failed to send error response to interaction:', responseError);
      }
    }
  }

  /**
   * Attempts to clean up a newly created role if it's no longer being used
   * Only deletes the role if no other rules are using it
   */
  private async cleanupNewlyCreatedRole(interaction: any, roleId: string, serverId: string): Promise<void> {
    try {
      // Check if any other rules are using this role
      const allRules = await this.dbSvc.getRoleMappings(serverId);
      const rulesUsingRole = allRules?.filter(rule => rule.role_id === roleId) || [];
      
      // If no other rules use this role, delete it
      if (rulesUsingRole.length === 0) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && role.editable) {
          await role.delete('Cleaning up unused role after rule undo');
          this.logger.log(`Cleaned up newly created role: ${role.name} (${roleId})`);
        }
      }
    } catch (error) {
      // Don't fail the undo operation if role cleanup fails
      this.logger.warn(`Failed to cleanup role ${roleId}:`, error);
    }
  }
}
