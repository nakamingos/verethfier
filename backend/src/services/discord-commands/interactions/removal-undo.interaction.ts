import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';

/**
 * Removal Undo Interaction Handler
 * 
 * Handles button interactions for undoing rule removals.
 * Manages collectors, timeouts, and restoration logic.
 * Supports both single and bulk undo operations.
 */
@Injectable()
export class RemovalUndoInteractionHandler {
  private readonly logger = new Logger(RemovalUndoInteractionHandler.name);

  // Maps to store removed rule data for undo functionality
  private removedRules = new Map<string, any>();
  private restoredRules = new Map<string, any>();

  constructor(
    private readonly dbSvc: DbService
  ) {}

  /**
   * Sets up button interaction handler for removal undo messages
   */
  setupRemovalButtonHandler(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    removedRules: Map<string, any>
  ): void {
    // Store reference to removed rules for this interaction
    this.removedRules = removedRules;

    const filter = (i: any) => 
      i.customId.startsWith('undo_removal_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_removal_')) {
        await this.handleUndoRemoval(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up removal data
        this.removedRules.delete(interaction.id);
      }
    });
  }

  /**
   * Sets up button interaction handler for removal undo messages with extended timeout
   */
  setupRemovalButtonHandlerWithExtendedTimeout(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    removedRules: Map<string, any>
  ): void {
    // Store reference to removed rules for this interaction
    this.removedRules = removedRules;

    const filter = (i: any) => 
      i.customId.startsWith('undo_removal_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 600000, // 10 minutes (extended timeout for undo chains)
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_removal_')) {
        await this.handleUndoRemoval(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up removal data
        this.removedRules.delete(interaction.id);
      }
    });
  }

  /**
   * Handles Undo button interaction for rule removal - recreates the removed rule(s)
   */
  private async handleUndoRemoval(interaction: any): Promise<void> {
    const interactionId = interaction.customId.replace('undo_removal_', '');
    const removedRuleData = this.removedRules.get(interactionId);
    
    if (!removedRuleData) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Rule removal cannot be undone.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Check if this is a bulk operation
      if (removedRuleData.isBulk && removedRuleData.rules) {
        await this.handleBulkUndoRemoval(interaction, removedRuleData.rules);
      } else {
        // Single rule removal (existing logic)
        await this.handleSingleUndoRemoval(interaction, removedRuleData);
      }

      // Clean up the removal data
      this.removedRules.delete(interactionId);
    } catch (error) {
      this.logger.error('Error undoing rule removal:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error restoring rule(s): ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Handles bulk undo removal for multiple rules
   */
  private async handleBulkUndoRemoval(interaction: any, removedRules: any[]): Promise<void> {
    const restorationResults = [];
    
    for (const removedRule of removedRules) {
      try {
        // Handle role recreation if needed
        let roleToUse = null;
        if (removedRule.wasNewlyCreated) {
          const existingRole = interaction.guild.roles.cache.get(removedRule.role_id);
          if (!existingRole) {
            // Recreate role
            const botMember = interaction.guild.members.me;
            let position = undefined;
            if (botMember) {
              const botHighestPosition = botMember.roles.highest.position;
              position = Math.max(1, botHighestPosition - 1);
            }

            roleToUse = await interaction.guild.roles.create({
              name: removedRule.role_name,
              color: 'Blue',
              position: position,
              reason: `Recreated for bulk rule restoration by ${interaction.user.tag}`
            });
            
            this.logger.log(`Recreated role for bulk rule restoration: ${roleToUse.name} (${roleToUse.id})`);
            removedRule.role_id = roleToUse.id;
          }
        }
        
        // Recreate the rule
        const recreatedRule = await this.dbSvc.restoreRuleWithOriginalId(removedRule);
        restorationResults.push({ 
          success: true, 
          rule: recreatedRule, 
          originalData: { ...removedRule, wasNewlyCreated: removedRule.wasNewlyCreated } 
        });
      } catch (error) {
        restorationResults.push({ 
          success: false, 
          ruleId: removedRule.id, 
          error: error.message,
          originalData: removedRule
        });
      }
    }

    // Send bulk restoration message (would need to import sendBulkRuleRestoredMessage or extract it)
    // TODO: Extract bulk restoration message sending to utils or handle via callback
    this.logger.log(`Bulk restoration completed: ${restorationResults.length} rules processed`);
  }

  /**
   * Handles single undo removal
   */
  private async handleSingleUndoRemoval(interaction: any, removedRule: any): Promise<void> {
    let roleToUse = null;
    
    // If this rule had a newly created role, we need to recreate it first
    if (removedRule.wasNewlyCreated) {
      try {
        // Check if the role still exists
        const existingRole = interaction.guild.roles.cache.get(removedRule.role_id);
        
        if (!existingRole) {
          // Role doesn't exist, recreate it
          const botMember = interaction.guild.members.me;
          let position = undefined;
          
          if (botMember) {
            const botHighestPosition = botMember.roles.highest.position;
            position = Math.max(1, botHighestPosition - 1);
          }

          roleToUse = await interaction.guild.roles.create({
            name: removedRule.role_name,
            color: 'Blue',
            position: position,
            reason: `Recreated for rule restoration by ${interaction.user.tag}`
          });
          
          this.logger.log(`Recreated role for rule restoration: ${roleToUse.name} (${roleToUse.id})`);
          removedRule.role_id = roleToUse.id;
        } else {
          roleToUse = existingRole;
          this.logger.log(`Using existing role for rule restoration: ${existingRole.name} (${existingRole.id})`);
        }
      } catch (roleError) {
        this.logger.error('Error recreating role for rule restoration:', roleError);
      }
    }
    
    // Recreate the rule in the database with original ID
    const recreatedRule = await this.dbSvc.restoreRuleWithOriginalId(removedRule);
    
    // Store the restored rule for potential undo
    const restoredRuleWithMetadata = {
      ...recreatedRule,
      wasNewlyCreated: removedRule.wasNewlyCreated
    };
    this.restoredRules.set(interaction.id, restoredRuleWithMetadata);
    
    // TODO: Extract message creation logic to utils or handle via callback
    this.logger.log(`Rule ${recreatedRule.id} restored successfully`);
  }
}
