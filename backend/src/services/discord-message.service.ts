import { Injectable, Logger } from '@nestjs/common';
import { GuildTextBasedChannel, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client } from 'discord.js';

@Injectable()
export class DiscordMessageService {
  private client: Client | null = null;

  /**
   * Initialize the service with the Discord client.
   */
  initialize(client: Client): void {
    this.client = client;
  }

  constructor() {}

  /**
   * Searches for ANY existing verification messages (legacy or new) in a Discord channel.
   * Simple approach: any message from our bot that has buttons is likely a verification message.
   * This prevents creating duplicate verification buttons regardless of format.
   * @param channel - The Discord channel to search in
   * @returns The message ID of ANY existing verification message, or null if not found
   */
  async findExistingVerificationMessage(channel: GuildTextBasedChannel): Promise<string | null> {
    try {
      // Check if client is properly initialized
      const botUserId = this.client?.user?.id;
      if (!botUserId) {
        Logger.error('Discord client not properly initialized or bot user ID not available');
        return null;
      }

      Logger.debug(`Searching for existing verification messages in channel ${channel.id}, bot user ID: ${botUserId}`);

      // Fetch recent messages from the channel (last 100 messages should be enough)
      const messages = await channel.messages.fetch({ limit: 100 });
      Logger.debug(`Fetched ${messages.size} messages from channel ${channel.id}`);
      
      let botMessagesCount = 0;
      let botMessagesWithButtonsCount = 0;

      for (const [messageId, message] of messages) {
        // Check if message is from our bot
        if (message.author.id !== botUserId) continue;
        botMessagesCount++;
        
        // Simple check: if it's from our bot and has buttons, it's likely a verification message
        if (message.components.length > 0) {
          botMessagesWithButtonsCount++;
          
          // Check if there's at least one button component
          for (const actionRow of message.components) {
            if (actionRow.type === 1 && 'components' in actionRow) { // ActionRowBuilder type
              const components = actionRow.components;
              for (const component of components) {
                if (component.type === 2) { // ButtonComponent type
                  Logger.debug(`Found existing bot message with button: ${messageId}`);
                  return messageId;
                }
              }
            }
          }
        }
      }
      
      Logger.debug(`Search complete for channel ${channel.id}: found ${botMessagesCount} bot messages, ${botMessagesWithButtonsCount} with buttons, 0 returned as verification messages`);
      return null;
    } catch (error) {
      Logger.error('Error searching for existing verification message:', error);
      return null;
    }
  }

  /**
   * Creates a new verification message in the specified channel
   * @param channel - The Discord channel to send the message to
   * @returns The message ID of the created verification message
   */
  async createVerificationMessage(channel: GuildTextBasedChannel): Promise<string> {
    const verifyEmbed = new EmbedBuilder()
      .setTitle('Request Verification')
      .setDescription('Click the button below to initiate the verification process.')
      .setColor('#c3ff00');
      
    const verifyButton = new ActionRowBuilder<ButtonBuilder>()
      .setComponents(
        new ButtonBuilder()
          .setCustomId('requestVerification')
          .setLabel('Request Verification')
          .setStyle(ButtonStyle.Primary)
      );

    const sentMessage = await channel.send({
      embeds: [verifyEmbed],
      components: [verifyButton],
    });

    Logger.debug(`Created new verification message: ${sentMessage.id}`);
    return sentMessage.id;
  }

  /**
   * Checks if a Discord message still exists in the channel
   * @param channel - The Discord channel to check
   * @param messageId - The ID of the message to verify
   * @returns True if the message exists, false otherwise
   */
  async verifyMessageExists(channel: GuildTextBasedChannel, messageId: string): Promise<boolean> {
    try {
      await channel.messages.fetch(messageId);
      return true;
    } catch (error) {
      // Message not found (deleted, etc.)
      return false;
    }
  }
}
