import { ChatInputCommandInteraction, TextChannel } from 'discord.js';
import { AdminFeedback } from '../../utils/admin-feedback.util';

/**
 * Rule Validation Utilities
 * 
 * Common validation functions for rule creation and management
 */

/**
 * Validates basic input parameters for rule creation.
 * @returns Input parameters if valid, null if validation failed (error already sent to user)
 */
export async function validateRuleInputParams(interaction: ChatInputCommandInteraction): Promise<{
  channel: TextChannel;
  roleName: string;
  slug: string;
  attributeKey: string;
  attributeValue: string;
  minItems: number;
} | null> {
  const channel = interaction.options.getChannel('channel') as TextChannel;
  const roleName = interaction.options.getString('role');
  const slug = interaction.options.getString('slug') || 'ALL';
  const attributeKey = interaction.options.getString('attribute_key') || 'ALL';
  const attributeValue = interaction.options.getString('attribute_value') || 'ALL';
  const minItems = interaction.options.getInteger('min_items') || 1;

  if (!channel || !roleName) {
    await interaction.editReply({
      content: AdminFeedback.simple('Channel and role are required.', true)
    });
    return null;
  }

  return { channel, roleName, slug, attributeKey, attributeValue, minItems };
}

/**
 * Formats attribute key/value pairs for display
 */
export function formatAttribute(key: string, value: string): string {
  if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
  if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
  if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
  return 'ALL';
}
