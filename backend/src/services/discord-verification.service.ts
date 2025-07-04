import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, CacheType, Client, MessageFlags } from 'discord.js';
import { DbService } from './db.service';
import { NonceService } from './nonce.service';

const EXPIRY = Number(process.env.NONCE_EXPIRY);

@Injectable()
export class DiscordVerificationService {
  private client: Client | null = null;
  
  tempMessages: {
    [nonce: string]: ButtonInteraction<CacheType>;
  } = {};

  /**
   * Initialize the service with the Discord client.
   */
  initialize(client: Client): void {
    this.client = client;
  }

  constructor(
    private readonly dbSvc: DbService,
    private readonly nonceSvc: NonceService
  ) {}

  /**
   * Requests verification from the user by sending a verification link.
   * @param interaction - The button interaction triggered by the user.
   */
  async requestVerification(interaction: ButtonInteraction<CacheType>): Promise<void> {
    try {
      // Defer the reply early to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const guild = interaction.guild;
      if (!guild) throw new Error('Guild not found');
      
      const channel = interaction.channel;
      if (!channel || !('id' in channel)) throw new Error('Channel not found');
      
      // Try to get the correct roleId (legacy or new)
      let roleId: string | null = null;
      try {
        roleId = await this.getVerificationRoleId(guild.id, channel.id, interaction.message.id);
      } catch (err) {
        Logger.error('Error fetching verification roleId', err);
      }
      
      Logger.debug('requestVerification: resolved roleId:', roleId);
      
      if (!roleId) throw new Error('Verification role not found for this message.');
      
      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error('Role not found');

      // Check if user is already verified
      // const userServers = await this.dbSvc.getUserServers(interaction.user.id);
      // if (userServers?.servers?.[guild.id]) {
      //   await interaction.editReply({
      //     embeds: [
      //       new EmbedBuilder()
      //         .setTitle('Verification Request')
      //         .setDescription('You have already been verified in this server.')
      //         .setColor('#FF0000')
      //     ]
      //   });
      //   
      //   return;
      // }

      // Create a nonce with message and channel info
      const expiry = Math.floor((Date.now() + EXPIRY) / 1000);
      const nonce = await this.nonceSvc.createNonce(
        interaction.user.id,
        interaction.message.id,
        channel.id
      );
      
      Logger.debug(`Created nonce with messageId: ${interaction.message.id}, channelId: ${channel.id}`);
      
      // Encode the payload (keeping legacy format for compatibility)
      const payloadArr = [
        interaction.user.id,
        interaction.user.tag,
        interaction.user.avatarURL(),
        interaction.guild.id,
        interaction.guild.name,
        interaction.guild.iconURL(),
        role.id, // TODO(v3): deprecated, remove when legacy buttons are phased out
        role.name, // TODO(v3): deprecated, remove when legacy buttons are phased out
        nonce,
        expiry,
      ];
      
      const encoded = Buffer.from(JSON.stringify(payloadArr)).toString('base64');
      const url = `${process.env.BASE_URL}/verify/${encoded}`;

      // Reply to the interaction
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Wallet Verification')
            .setDescription(`Verify your identity using your EVM wallet by clicking the unique link below. This link is personal and expires <t:${expiry}:R>.`)
            .setColor('#00FF00')
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .setComponents(
              new ButtonBuilder()
                .setLabel('Verify Now')
                .setURL(url)
                .setStyle(ButtonStyle.Link)
            )
        ]
      });

      // Store the temp message
      this.tempMessages[nonce] = interaction;
      
      Logger.debug(`Sent verification link to ${interaction.user.tag}`);
    } catch (error) {
      Logger.error('Error in requestVerification:', error);
      if (interaction.deferred) {
        await interaction.editReply({
          content: `Error: ${error.message}`
        });
      } else {
        try {
          await interaction.reply({
            content: `Error: ${error.message}`,
            flags: MessageFlags.Ephemeral
          });
        } catch (replyError) {
          Logger.error('Failed to reply with error:', replyError);
        }
      }
    }
  }

  /**
   * Adds a role to a user in a guild.
   * 
   * @param userId - The ID of the user.
   * @param roleId - The ID of the role to be added.
   * @param guildId - The ID of the guild.
   * @throws Error if the Discord bot is not initialized, guild is not found, or member is not found.
   */
  async addUserRole(
    userId: string, 
    roleId: string,
    guildId: string,
    address: string,
    nonce: string
  ): Promise<void> {
    if (!this.client) throw new Error('Discord bot not initialized');

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    Logger.debug('addUserRole: roleId from payload:', roleId);
    Logger.debug('addUserRole: guild roles:', guild.roles.cache.map(r => ({ id: r.id, name: r.name })));

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const role = guild.roles.cache.get(roleId);
    if (!role) throw new Error('Role not found');
      
    const storedInteraction = this.tempMessages[nonce];
    if (!storedInteraction) {
      throw new Error('No stored interaction found for this nonce');
    }

    try {
      await member.roles.add(role);
      await this.dbSvc.addServerToUser(
        userId, 
        guildId, 
        role.name,
        address
      );

      // Reply to the interaction
      await storedInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Successful')
            .setDescription(`You have been successfully verified in ${guild.name}.`)
            .setColor('#00FF00')
        ],
      });
      
    } catch (error) {
      Logger.error('Error in addUserRole:', error);

      // Reply to the interaction
      await storedInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Failed')
            .setDescription(`An error occurred while verifying your identity. Please try again later.`)
            .setColor('#FF0000')
        ],
      });

    } finally {
      
      // Delete the temp message
      delete this.tempMessages[nonce];
    }
  }

  /**
   * Throws an error by editing the stored interaction with an error message.
   * @param nonce - The nonce associated with the stored interaction.
   * @param message - The error message to display.
   */
  async throwError(nonce: string, message: string): Promise<void> {
    const storedInteraction = this.tempMessages[nonce];
    if (!storedInteraction) {
      Logger.warn(`No stored interaction found for nonce: ${nonce}`);
      return;
    }

    try {
      // Check if interaction is still valid
      if (!storedInteraction.isRepliable()) {
        Logger.warn(`Interaction for nonce ${nonce} is no longer repliable`);
        return;
      }
      
      await storedInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Failed')
            .setDescription(`${message}`)
            .setColor('#FF0000')
        ],
      });
    } catch (error) {
      Logger.error(`Failed to edit reply for nonce ${nonce}:`, error);
    } finally {
      // Clean up the stored interaction
      delete this.tempMessages[nonce];
    }
  }

  /**
   * Helper to get the correct roleId for verification, supporting both legacy and new rules.
   */
  async getVerificationRoleId(guildId: string, channelId: string, messageId: string): Promise<string | null> {
    // Try legacy first
    const legacyRoleId = await this.dbSvc.getServerRole(guildId);
    if (legacyRoleId) return legacyRoleId;
    // Try new rules
    const rule = await this.dbSvc.findRuleByMessageId(guildId, channelId, messageId);
    if (rule && rule.role_id) return rule.role_id;
    return null;
  }
}
