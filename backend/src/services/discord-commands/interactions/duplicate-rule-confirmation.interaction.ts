import { Injectable, Logger } from '@nestjs/common';
import { ChatInputCommandInteraction, TextChannel, Role, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import { AdminFeedback } from '../../utils/admin-feedback.util';

@Injectable()
export class DuplicateRuleConfirmationInteractionHandler {
  private pendingRules: Map<string, any> = new Map();
  private cancelledRules: Map<string, any> = new Map();

  storeRuleData(interactionId: string, ruleData: any): void {
    this.pendingRules.set(interactionId, ruleData);
  }

  getPendingRule(interactionId: string): any {
    return this.pendingRules.get(interactionId);
  }

  deletePendingRule(interactionId: string): void {
    this.pendingRules.delete(interactionId);
  }

  storeCancelledRule(interactionId: string, ruleData: any): void {
    this.cancelledRules.set(interactionId, ruleData);
  }

  getCancelledRule(interactionId: string): any {
    return this.cancelledRules.get(interactionId);
  }

  deleteCancelledRule(interactionId: string): void {
    this.cancelledRules.delete(interactionId);
  }

  createDuplicateRuleButtons(interactionId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_duplicate_${interactionId}`)
          .setLabel('Create Anyway')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`cancel_duplicate_${interactionId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );
  }

  createUndoRemovalButton(interactionId: string, type: 'removal' | 'cancellation'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`undo_${type}_${interactionId}`)
          .setLabel('Undo')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('↩️')
      );
  }

  setupDuplicateRuleButtonHandler(
    interaction: ChatInputCommandInteraction,
    onConfirm: (ruleData: any) => Promise<void>,
    onCancel: (ruleData: any) => Promise<void>
  ): void {
    const filter = (i: any) => i.customId.endsWith(`_${interaction.id}`) && i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('confirm_duplicate_')) {
        await i.deferUpdate();
        const ruleData = this.getPendingRule(interaction.id);
        if (ruleData) {
          await onConfirm(ruleData);
          this.deletePendingRule(interaction.id);
        }
      } else if (i.customId.startsWith('cancel_duplicate_')) {
        await i.deferUpdate();
        const ruleData = this.getPendingRule(interaction.id);
        if (ruleData) {
          this.storeCancelledRule(interaction.id, ruleData);
          await onCancel(ruleData);
          this.deletePendingRule(interaction.id);
        }
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.deletePendingRule(interaction.id);
        interaction.editReply({
          embeds: [AdminFeedback.info('Request Timed Out', 'Rule creation was cancelled due to timeout.')],
          components: []
        }).catch(() => {}); // Ignore errors if interaction is no longer valid
      }
    });
  }

  setupCancellationButtonHandler(
    interaction: ChatInputCommandInteraction,
    onUndo: (ruleData: any) => Promise<void>
  ): void {
    const filter = (i: any) => i.customId.endsWith(`_${interaction.id}`) && i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_cancellation_')) {
        await i.deferUpdate();
        const ruleData = this.getCancelledRule(interaction.id);
        if (ruleData) {
          await onUndo(ruleData);
          this.deleteCancelledRule(interaction.id);
        }
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.deleteCancelledRule(interaction.id);
      }
    });
  }

  createRuleInfoFields(rule: any): Array<{name: string, value: string, inline: boolean}> {
    const fields = [];
    
    if (rule.channel_name) {
      fields.push({
        name: 'Channel',
        value: rule.channel_name,
        inline: true
      });
    }
    
    if (rule.role_name) {
      fields.push({
        name: 'Role',
        value: `@${rule.role_name}`,
        inline: true
      });
    }
    
    if (rule.slug) {
      fields.push({
        name: 'Collection',
        value: rule.slug,
        inline: true
      });
    }
    
    if (rule.attribute_key && rule.attribute_value) {
      const formatAttribute = (key: string, value: string) => {
        if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
        if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
        if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
        return 'ALL';
      };
      
      fields.push({
        name: 'Attribute',
        value: formatAttribute(rule.attribute_key, rule.attribute_value),
        inline: true
      });
    }
    
    if (rule.min_items !== undefined) {
      fields.push({
        name: 'Min Items',
        value: rule.min_items.toString(),
        inline: true
      });
    }
    
    return fields;
  }
}
