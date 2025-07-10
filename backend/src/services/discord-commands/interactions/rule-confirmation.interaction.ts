import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';

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

  constructor(
    private readonly dbSvc: DbService
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
      i.customId.endsWith(`_${interaction.id}`) && 
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
      
      if (ruleToRemove) {
        // Store for potential undo of this removal, including wasNewlyCreated flag
        const removedRuleWithMetadata = {
          ...ruleToRemove,
          wasNewlyCreated: confirmationInfo.wasNewlyCreated
        };
        this.removedRules.set(interaction.id, removedRuleWithMetadata);
      }

      // Delete the rule from the database
      await this.dbSvc.deleteRoleMapping(confirmationInfo.ruleId.toString(), confirmationInfo.serverId);
      
      // If this rule involved creating a new role, try to clean it up
      if (confirmationInfo.wasNewlyCreated && ruleToRemove) {
        await this.cleanupNewlyCreatedRole(interaction, ruleToRemove.role_id, confirmationInfo.serverId);
      }
      
      // Create rule info fields for the removed rule
      const ruleInfoFields = this.createRuleInfoFields(ruleToRemove);
      const embed = AdminFeedback.success('Rule Removed', `Rule ${ruleToRemove.id} for ${ruleToRemove.channel_name} and @${ruleToRemove.role_name} has been removed.`);
      embed.addFields(ruleInfoFields);
      
      await interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`undo_removal_${interaction.id}`)
                .setLabel('Undo')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('↩️')
            )
        ],
        ephemeral: true
      });

      // Clean up the confirmation data
      this.confirmationData.delete(interactionId);
    } catch (error) {
      this.logger.error('Error undoing rule creation:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error undoing rule: ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Creates detailed rule information fields for consistent display
   */
  createRuleInfoFields(ruleData: any): any[] {
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
