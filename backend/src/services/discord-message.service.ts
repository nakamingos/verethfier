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
   * Searches for existing Wallet Verification messages in a Discord channel.
   * Looks for messages with "Wallet Verification" embed title and "Verify Now" button.
   * @param channel - The Discord channel to search in
   * @returns The message ID of the existing verification message, or null if not found
   */
  async findExistingVerificationMessage(channel: GuildTextBasedChannel): Promise<string | null> {
    try {
      // Fetch recent messages from the channel (last 100 messages should be enough)
      const messages = await channel.messages.fetch({ limit: 100 });
      
      for (const [messageId, message] of messages) {
        // Check if message is from our bot
        if (message.author.id !== this.client?.user?.id) continue;
        
        // Check if message has embeds with "Wallet Verification" title
        if (message.embeds.length > 0) {
          const embed = message.embeds[0];
          if (embed.title === 'Wallet Verification') {
            // Check if message has components with "Verify Now" button
            if (message.components.length > 0) {
              const actionRow = message.components[0];
              if (actionRow.type === 1 && 'components' in actionRow) { // ActionRowBuilder type
                const components = actionRow.components;
                if (components.length > 0) {
                  const button = components[0];
                  // Check if it's a button component and has the right properties
                  if (button.type === 2) { // ButtonComponent type
                    const buttonComponent = button as any; // Type assertion to access button properties
                    if ((buttonComponent.customId === 'requestVerification' && buttonComponent.label === 'Verify Now') ||
                        (buttonComponent.style === ButtonStyle.Link && buttonComponent.label === 'Verify Now')) {
                      Logger.debug(`Found existing Wallet Verification message: ${messageId}`);
                      return messageId;
                    }
                  }
                }
              }
            }
          }
        }
      }
      
      Logger.debug('No existing Wallet Verification message found in channel');
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
      .setTitle('Wallet Verification')
      .setDescription('Verify your identity using your EVM wallet by clicking the button below.')
      .setColor('#00FF00');
      
    const verifyButton = new ActionRowBuilder<ButtonBuilder>()
      .setComponents(
        new ButtonBuilder()
          .setCustomId('requestVerification')
          .setLabel('Verify Now')
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
