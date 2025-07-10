import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, ChatInputCommandInteraction, ComponentType } from 'discord.js';
import { DbService } from '../../db.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';

/**
 * Restore Undo Interaction Handler
 * 
 * Handles button interactions for undoing rule restorations.
 * Manages collectors, timeouts, and removal logic for restored rules.
 * Supports both single and bulk undo operations.
 */
@Injectable()
export class RestoreUndoInteractionHandler {
  private readonly logger = new Logger(RestoreUndoInteractionHandler.name);

  // Maps to store restored rule data for undo functionality
  private restoredRules = new Map<string, any>();
  private removedRules = new Map<string, any>();

  constructor(
    private readonly dbSvc: DbService
  ) {}

  /**
   * Sets up button handler for rule restoration undo functionality
   */
  setupRestoreButtonHandler(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    restoredRules: Map<string, any>
  ): void {
    // Store reference to restored rules for this interaction
    this.restoredRules = restoredRules;

    const filter = (i: any) => 
      i.customId.startsWith('undo_restore_') && 
      i.customId.endsWith(`${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_restore_')) {
        await this.handleUndoRestore(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up restore data
        this.restoredRules.delete(interaction.id);
      }
    });
  }

  /**
   * Handles Undo button interaction for rule restoration - removes the restored rule(s)
   */
  private async handleUndoRestore(interaction: ButtonInteraction): Promise<void> {
    const interactionId = interaction.customId.replace('undo_restore_', '');
    const restoredRuleData = this.restoredRules.get(interactionId);

    if (!restoredRuleData) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Rule restoration cannot be undone.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Check if this is a bulk operation
      if (restoredRuleData.isBulk && restoredRuleData.rules) {
        await this.handleBulkUndoRestore(interaction, restoredRuleData.rules);
      } else {
        // Single rule restoration (existing logic)
        await this.handleSingleUndoRestore(interaction, restoredRuleData, interactionId);
      }

      // Clean up the restore data
      this.restoredRules.delete(interactionId);
    } catch (error) {
      this.logger.error('Error undoing rule restoration:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error removing rule(s): ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Handles bulk undo restore for multiple rules
   */
  private async handleBulkUndoRestore(interaction: any, restoredRules: any[]): Promise<void> {
    const removalResults = [];
    
    for (const restoredRule of restoredRules) {
      try {
        // Remove the rule that was restored
        await this.dbSvc.deleteRoleMapping(String(restoredRule.id), restoredRule.server_id);
        
        // If this rule was restored with a newly created role, try to clean it up
        if (restoredRule.wasNewlyCreated) {
          await this.cleanupNewlyCreatedRole(interaction, restoredRule.role_id, restoredRule.server_id);
        }
        
        removalResults.push({ 
          success: true, 
          rule: restoredRule
        });
      } catch (error) {
        removalResults.push({ 
          success: false, 
          ruleId: restoredRule.id, 
          error: error.message,
          rule: restoredRule
        });
      }
    }

    // Store the removed rules for potential undo (restore again)
    const successful = removalResults.filter(r => r.success);
    if (successful.length > 0) {
      const bulkRemovedData = {
        rules: successful.map(s => ({ ...s.rule, wasNewlyCreated: s.rule.wasNewlyCreated })),
        isBulk: true
      };
      this.removedRules.set(interaction.id, bulkRemovedData);
    }

    // TODO: Extract bulk removal message sending to utils or handle via callback
    this.logger.log(`Bulk undo restore completed: ${removalResults.length} rules processed`);
  }

  /**
   * Handles single undo restore
   */
  private async handleSingleUndoRestore(interaction: any, restoredRuleData: any, interactionId: string): Promise<void> {
    // Remove the rule that was restored
    await this.dbSvc.deleteRoleMapping(String(restoredRuleData.id), restoredRuleData.server_id);
    
    // If this rule was restored with a newly created role, try to clean it up
    if (restoredRuleData.wasNewlyCreated) {
      await this.cleanupNewlyCreatedRole(interaction, restoredRuleData.role_id, restoredRuleData.server_id);
    }

    // Store the removed rule for potential undo (restore again)
    this.removedRules.set(interaction.id, {
      ...restoredRuleData,
      wasNewlyCreated: restoredRuleData.wasNewlyCreated
    });

    // TODO: Extract message creation logic to utils or handle via callback
    this.logger.log(`Rule ${restoredRuleData.id} removed successfully (undo restore)`);
  }

  /**
   * Cleanup a newly created role if it's safe to do so
   */
  private async cleanupNewlyCreatedRole(interaction: any, roleId: string, serverId: string): Promise<void> {
    try {
      // Check if this role is used by any other rules by querying the database directly
      // Since we don't have a getRulesByRole method, we'll use a more conservative approach
      // and skip role cleanup for now to avoid complexity
      this.logger.log(`Skipping role cleanup for ${roleId} - would need custom query to check usage safely`);
    } catch (error) {
      this.logger.error(`Error cleaning up newly created role ${roleId}:`, error);
      // Don't throw - role cleanup is not critical
    }
  }
}
