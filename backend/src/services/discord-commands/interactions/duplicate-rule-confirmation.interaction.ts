import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction, TextChannel, Role, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { AdminFeedback } from '../../utils/admin-feedback.util';
import { RuleConfirmationInteractionHandler } from './rule-confirmation.interaction';

@Injectable()
export class DuplicateRuleConfirmationInteractionHandler {
  private readonly logger = new Logger(DuplicateRuleConfirmationInteractionHandler.name);
  private pendingRules: Map<string, any> = new Map();
  private cancelledRules: Map<string, any> = new Map();

  constructor(
    @Inject(forwardRef(() => RuleConfirmationInteractionHandler))
    private readonly ruleConfirmationHandler: RuleConfirmationInteractionHandler
  ) {}

  storeRuleData(chainId: string, ruleData: any): void {
    this.pendingRules.set(chainId, ruleData);
  }

  getPendingRule(chainId: string): any {
    return this.pendingRules.get(chainId);
  }

  deletePendingRule(chainId: string): void {
    this.pendingRules.delete(chainId);
  }

  storeCancelledRule(chainId: string, ruleData: any): void {
    this.cancelledRules.set(chainId, ruleData);
  }

  getCancelledRule(chainId: string): any {
    return this.cancelledRules.get(chainId);
  }

  deleteCancelledRule(chainId: string): void {
    this.cancelledRules.delete(chainId);
  }

  createDuplicateRuleButtons(chainId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_duplicate_${chainId}`)
          .setLabel('Create Anyway')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`cancel_duplicate_${chainId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );
  }

  createUndoRemovalButton(chainId: string, type: 'removal' | 'cancellation'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`undo_${type}_${chainId}`)
          .setLabel('Undo')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('↩️')
      );
  }

  setupDuplicateRuleButtonHandler(
    interaction: ChatInputCommandInteraction,
    chainId: string,
    onConfirm: (ruleData: any) => Promise<void>,
    onCancel: (ruleData: any) => Promise<void>
  ): void {
    const filter = (i: any) => 
      (i.customId === `confirm_duplicate_${chainId}` || i.customId === `cancel_duplicate_${chainId}`) && 
      i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 60000,
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      try {
        this.logger.debug(`Processing duplicate rule button interaction: ${i.customId}`);
        
        // Acknowledge the interaction first to prevent "interaction failed" errors
        if (!i.replied && !i.deferred) {
          await i.deferUpdate();
          this.logger.debug(`Deferred update for interaction: ${i.customId}`);
        }

        if (i.customId === `confirm_duplicate_${chainId}`) {
          const ruleData = this.getPendingRule(chainId);
          if (ruleData) {
            // Store confirmation data for undo functionality before proceeding
            this.ruleConfirmationHandler.storeConfirmationData(chainId, {
              ruleId: ruleData.id || 'pending', // Will be updated after creation
              serverId: ruleData.serverId,
              wasNewlyCreated: ruleData.wasNewlyCreated || false
            });
            
            await onConfirm(ruleData);
            this.deletePendingRule(chainId);
          }
        } else if (i.customId === `cancel_duplicate_${chainId}`) {
          const ruleData = this.getPendingRule(chainId);
          if (ruleData) {
            this.storeCancelledRule(chainId, ruleData);
            await onCancel(ruleData);
            this.deletePendingRule(chainId);
          }
        }
        collector.stop();
      } catch (error) {
        this.logger.error('Error handling duplicate rule button interaction:', error);
        
        // Try to respond with error if interaction hasn't been acknowledged
        try {
          if (!i.replied && !i.deferred) {
            await i.reply({
              content: AdminFeedback.simple(`Error: ${error.message}`, true),
              ephemeral: true
            });
          } else if (i.replied) {
            await i.followUp({
              content: AdminFeedback.simple(`Error: ${error.message}`, true),
              ephemeral: true
            });
          }
        } catch (responseError) {
          this.logger.error('Failed to send error response:', responseError);
        }
      }
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.deletePendingRule(chainId);
        interaction.editReply({
          embeds: [AdminFeedback.info('Request Timed Out', 'Rule creation was cancelled due to timeout.')],
          components: []
        }).catch((error) => {
          this.logger.warn('Failed to update interaction after timeout:', error);
        });
      }
    });
  }

  setupCancellationButtonHandler(
    interaction: ChatInputCommandInteraction,
    chainId: string,
    onUndo: (ruleData: any) => Promise<void>
  ): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_cancellation_') && 
      i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      try {
        // Acknowledge the interaction first to prevent "interaction failed" errors
        if (!i.replied && !i.deferred) {
          await i.deferUpdate();
        }

        if (i.customId.startsWith('undo_cancellation_')) {
          const buttonChainId = i.customId.replace('undo_cancellation_', '');
          const ruleData = this.getCancelledRule(buttonChainId);
          if (ruleData) {
            await onUndo(ruleData);
            this.deleteCancelledRule(buttonChainId);
          }
        }
        collector.stop();
      } catch (error) {
        this.logger.error('Error handling cancellation undo interaction:', error);
        
        // Try to respond with error if interaction hasn't been acknowledged
        try {
          if (!i.replied && !i.deferred) {
            await i.reply({
              content: AdminFeedback.simple(`Error: ${error.message}`, true),
              ephemeral: true
            });
          } else if (i.replied) {
            await i.followUp({
              content: AdminFeedback.simple(`Error: ${error.message}`, true),
              ephemeral: true
            });
          }
        } catch (responseError) {
          this.logger.error('Failed to send error response:', responseError);
        }
      }
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.deleteCancelledRule(chainId);
        this.logger.debug(`Cancellation undo collector timed out for chain ${chainId}`);
      }
    });
  }

  createRuleInfoFields(rule: any): Array<{name: string, value: string, inline: boolean}> {
    const fields = [];
    
    // Collection
    if (rule.slug) {
      fields.push({
        name: '**Collection**',
        value: rule.slug,
        inline: true
      });
    }
    
    // Attribute
    if (rule.attribute_key && rule.attribute_value) {
      const formatAttribute = (key: string, value: string) => {
        if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
        if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
        if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
        return 'ALL';
      };
      
      fields.push({
        name: '**Attribute**',
        value: formatAttribute(rule.attribute_key, rule.attribute_value),
        inline: true
      });
    }
    
    // Min Items
    if (rule.min_items !== undefined) {
      fields.push({
        name: '**Min Items**',
        value: rule.min_items.toString(),
        inline: true
      });
    }
    
    return fields;
  }
}
