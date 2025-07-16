import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, CacheType, Client, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import { DbService } from './db.service';
import { NonceService } from './nonce.service';

// Load environment variables
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);

/**
 * DiscordVerificationService
 * 
 * Handles Discord-specific verification interactions and role management.
 * Manages the user-facing verification flow from Discord button clicks
 * through role assignment completion.
 * 
 * Key responsibilities:
 * - Process verification button interactions
 * - Generate verification links with encoded payloads
 * - Assign Discord roles after successful verification
 * - Handle verification error reporting
 */
@Injectable()
export class DiscordVerificationService {
  private client: Client | null = null;
  
  tempMessages: {
    [nonce: string]: ButtonInteraction<CacheType>;
  } = {};

  /**
   * Initialize the service with the Discord client instance.
   * Required for Discord API operations and role management.
   * 
   * @param client - The initialized Discord.js client
   */
  initialize(client: Client): void {
    this.client = client;
  }

  constructor(
    private readonly dbSvc: DbService,
    private readonly nonceSvc: NonceService
  ) {}

  /**
   * Handles verification button interactions from Discord users.
   * 
   * This method initiates the verification flow when a user clicks a verification button:
   * 1. Validates the Discord context (guild, channel, role)
   * 2. Creates a secure nonce linked to the message/channel
   * 3. Generates an encoded verification payload
   * 4. Provides a verification link for the user to complete wallet signing
   * 
   * @param interaction - The Discord button interaction triggered by the user
   * @throws Error if guild/channel/role not found or verification setup invalid
   */
  async requestVerification(interaction: ButtonInteraction<CacheType>): Promise<void> {
    try {
      // Note: interaction should already be deferred by the caller
      
      const guild = interaction.guild;
      if (!guild) throw new Error('Guild not found');
      
      const channel = interaction.channel;
      if (!channel || !('id' in channel)) throw new Error('Channel not found');
      
      // Get verification rules for this channel
      let rules: any[] = [];
      try {
        rules = await this.dbSvc.getRulesByChannel(guild.id, channel.id);
      } catch (err) {
        Logger.error('Error fetching verification rules', err);
      }
      
      if (!rules || rules.length === 0) throw new Error('No verification rules found for this channel.');
      
      // Use the first rule found (most common case is one rule per channel)
      const rule = rules[0];
      const role = guild.roles.cache.get(rule.role_id);
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
      
      // Encode the payload
      const payloadArr = [
        interaction.user.id,
        interaction.user.tag,
        interaction.user.avatarURL(),
        interaction.guild.id,
        interaction.guild.name,
        interaction.guild.iconURL(),
        role.id,
        role.name,
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
      
    } catch (error) {
      Logger.error('Error in requestVerification:', error);
      // Since interaction is already deferred by caller, we can directly edit reply
      try {
        await interaction.editReply({
          content: `Error: ${error.message}`
        });
      } catch (replyError) {
        Logger.error('Failed to edit reply with error:', replyError);
      }
    }
  }

  /**
   * Adds a role to a user in a guild.
   * 
   * @param userId - The ID of the user.
   * @param roleId - The ID of the role to be added.
   * @param guildId - The ID of the guild.
   * @returns Object indicating if the role was newly assigned or already possessed
   * @throws Error if the Discord bot is not initialized, guild is not found, or member is not found.
   */
  async addUserRole(
    userId: string, 
    roleId: string,
    guildId: string,
    nonce: string,
    ruleId?: string
  ): Promise<{ roleId: string; roleName: string; wasAlreadyAssigned: boolean }> {
    if (!this.client) throw new Error('Discord bot not initialized');

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const role = guild.roles.cache.get(roleId);
    if (!role) throw new Error('Role not found');
      
    const storedInteraction = this.tempMessages[nonce];
    // For reverification or other background processes, nonce might not have a stored interaction
    if (!storedInteraction && nonce !== 'reverification') {
      throw new Error('No stored interaction found for this nonce');
    }

    // Check if user already has the role
    // We can use the already fetched member as Discord.js handles caching appropriately
    const wasAlreadyAssigned = member.roles.cache.has(roleId);

    // Add the role - Discord will handle this gracefully if user already has it
    await member.roles.add(role);

    // Always track role assignment - the trackRoleAssignment method handles existing records properly
    // This ensures that revoked roles get reactivated when users re-verify
    try {
      await this.dbSvc.trackRoleAssignment({
        userId,
        serverId: guildId,
        roleId,
        ruleId: ruleId || null,
        userName: member.displayName || member.user.username,
        serverName: guild.name,
        roleName: role.name,
        expiresInHours: undefined // No expiration by default
      });
    } catch (error) {
      // Check if it's a unique constraint violation (role already tracked)
      if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
        // This is expected during concurrent verifications - don't log as error
      } else {
        Logger.error(`addUserRole: Unexpected error tracking role assignment for user ${userId}, role ${roleId}:`, error);
      }
      // Don't fail the entire process if tracking fails
    }

    return {
      roleId,
      roleName: role.name,
      wasAlreadyAssigned
    };
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
        components: [] // Remove the "Verify Now" button on error too
      });
    } catch (error) {
      Logger.error(`Failed to edit reply for nonce ${nonce}:`, error);
    } finally {
      // Clean up the stored interaction
      delete this.tempMessages[nonce];
    }
  }

  /**
   * Sends a verification complete message showing all assigned roles
   */
  async sendVerificationComplete(
    guildId: string,
    nonce: string,
    roleResults: Array<{ roleId: string; roleName: string; wasAlreadyAssigned: boolean }>
  ): Promise<void> {
    if (!this.client) throw new Error('Discord bot not initialized');

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const storedInteraction = this.tempMessages[nonce];
    if (!storedInteraction) {
      throw new Error('No stored interaction found for this nonce');
    }

    try {
      // Deduplicate roles based on roleId and assignment status
      const uniqueRoleResults = roleResults.reduce((acc, role) => {
        const key = `${role.roleId}-${role.wasAlreadyAssigned}`;
        if (!acc.some(r => `${r.roleId}-${r.wasAlreadyAssigned}` === key)) {
          acc.push(role);
        }
        return acc;
      }, [] as Array<{ roleId: string; roleName: string; wasAlreadyAssigned: boolean }>);

      // Separate roles into newly assigned and already possessed
      const newRoles = uniqueRoleResults.filter(r => !r.wasAlreadyAssigned);
      const existingRoles = uniqueRoleResults.filter(r => r.wasAlreadyAssigned);
      
      let description = `You have been successfully verified in ${guild.name}`;
      
      // Add new roles section if any
      if (newRoles.length > 0) {
        description += `\n\n**🎉 New Roles Assigned:**\n${newRoles.map(r => `• ${r.roleName}`).join('\n')}`;
      }
      
      // Add existing roles section if any
      if (existingRoles.length > 0) {
        description += `\n\n**✅ Roles You Already Have:**\n${existingRoles.map(r => `• ${r.roleName}`).join('\n')}`;
      }
      
      // Show summary at the end
      if (uniqueRoleResults.length > 0) {
        const totalNew = newRoles.length;
        const totalExisting = existingRoles.length;
        
        if (totalNew > 0 && totalExisting > 0) {
          description += `\n\n*${totalNew} new role${totalNew > 1 ? 's' : ''}, ${totalExisting} existing role${totalExisting > 1 ? 's' : ''}*`;
        } else if (totalNew > 0) {
          description += `\n\n*${totalNew} new role${totalNew > 1 ? 's' : ''} assigned*`;
        } else if (totalExisting > 0) {
          description += `\n\n*You already had all ${totalExisting} role${totalExisting > 1 ? 's' : ''} for this verification*`;
        }
      }

      if (!storedInteraction.isRepliable()) {
        Logger.warn(`Interaction for nonce ${nonce} is no longer repliable during success message`);
        return;
      }

      await storedInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Successful')
            .setDescription(description)
            .setColor('#00FF00')
        ],
        components: [] // Remove the "Verify Now" button
      });
      
    } catch (error) {
      Logger.error('Error in sendVerificationComplete:', error.message);

      // Fallback: try to send basic success message
      try {
        if (storedInteraction && storedInteraction.isRepliable()) {
          await storedInteraction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle('Verification Successful')
                .setDescription(`You have been successfully verified in ${guild.name}.`)
                .setColor('#00FF00')
            ],
            components: [] // Remove the "Verify Now" button in fallback case too
          });
        }
      } catch (fallbackError) {
        Logger.error('Failed to send fallback success message:', fallbackError);
      }
    } finally {
      // Clean up the stored interaction
      delete this.tempMessages[nonce];
    }
  }

  /**
   * Helper to get the correct roleId for verification.
   */
  // =======================================
  // DYNAMIC ROLE MANAGEMENT METHODS
  // =======================================

  /**
   * Remove a Discord role from a user
   * Used for dynamic role revocation when holdings no longer meet criteria
   */
  async removeUserRole(userId: string, serverId: string, roleId: string): Promise<boolean> {
    if (!this.client) {
      Logger.error('Discord client not initialized');
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      if (!guild) {
        Logger.error(`Guild ${serverId} not found`);
        return false;
      }

      const member = await guild.members.fetch(userId);
      if (!member) {
        Logger.debug(`Member ${userId} not found in guild ${serverId}`);
        return false;
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        Logger.error(`Role ${roleId} not found in guild ${serverId}`);
        return false;
      }

      // Check if user actually has the role
      if (!member.roles.cache.has(roleId)) {
        Logger.debug(`User ${userId} doesn't have role ${roleId} in guild ${serverId}`);
        return true; // Consider this success since the desired state is achieved
      }

      await member.roles.remove(role, 'Dynamic role verification: holdings no longer meet criteria');
      Logger.log(`✅ Removed role "${role.name}" from user ${userId} in ${guild.name}`);
      return true;

    } catch (error) {
      Logger.error(`Failed to remove role ${roleId} from user ${userId} in guild ${serverId}:`, error);
      return false;
    }
  }

  /**
   * Add a Discord role to a user (dynamic version)
   * Used for dynamic role assignment - different signature from the verification flow method
   */
  async addUserRoleDynamic(userId: string, serverId: string, roleId: string): Promise<boolean> {
    if (!this.client) {
      Logger.error('Discord client not initialized');
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      if (!guild) {
        Logger.error(`Guild ${serverId} not found`);
        return false;
      }

      const member = await guild.members.fetch(userId);
      if (!member) {
        Logger.debug(`Member ${userId} not found in guild ${serverId}`);
        return false;
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        Logger.error(`Role ${roleId} not found in guild ${serverId}`);
        return false;
      }

      // Check if user already has the role
      if (member.roles.cache.has(roleId)) {
        Logger.debug(`User ${userId} already has role ${roleId} in guild ${serverId}`);
        return true;
      }

      await member.roles.add(role, 'Dynamic role verification: holdings meet criteria');
      Logger.log(`✅ Added role "${role.name}" to user ${userId} in ${guild.name}`);
      return true;

    } catch (error) {
      Logger.error(`Failed to add role ${roleId} to user ${userId} in guild ${serverId}:`, error);
      return false;
    }
  }

  /**
   * Check if a user is still in a Discord server
   * Used to clean up role assignments for users who left
   */
  async isUserInServer(userId: string, serverId: string): Promise<boolean> {
    if (!this.client) {
      Logger.error('Discord client not initialized');
      return false;
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      if (!guild) {
        Logger.error(`Guild ${serverId} not found`);
        return false;
      }

      const member = await guild.members.fetch(userId);
      return !!member;

    } catch (error) {
      // User likely left the server
      Logger.debug(`User ${userId} not found in guild ${serverId}:`, error.message);
      return false;
    }
  }

  /**
   * Get Discord user and server names for enhanced tracking
   */
  async getDiscordNames(userId: string, serverId: string): Promise<{
    userName?: string;
    serverName?: string;
    roleName?: string;
  }> {
    if (!this.client) {
      return {};
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      const member = await guild.members.fetch(userId);
      
      return {
        userName: member.displayName || member.user.username,
        serverName: guild.name
      };
    } catch (error) {
      Logger.debug(`Failed to get Discord names for user ${userId} in server ${serverId}:`, error.message);
      return {};
    }
  }

  /**
   * Get Discord role name by role ID
   */
  async getRoleName(serverId: string, roleId: string): Promise<string | undefined> {
    if (!this.client) {
      return undefined;
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      const role = await guild.roles.fetch(roleId);
      return role?.name;
    } catch (error) {
      Logger.debug(`Failed to get role name for role ${roleId} in server ${serverId}:`, error.message);
      return undefined;
    }
  }

  /**
   * Get guild member by user ID
   */
  async getGuildMember(serverId: string, userId: string): Promise<any> {
    if (!this.client) {
      Logger.error('Discord client not initialized');
      return null;
    }

    try {
      const guild = await this.client.guilds.fetch(serverId);
      if (!guild) {
        Logger.error(`Guild ${serverId} not found`);
        return null;
      }

      const member = await guild.members.fetch(userId);
      return member;

    } catch (error) {
      Logger.debug(`Failed to get guild member ${userId} in server ${serverId}:`, error.message);
      return null;
    }
  }
}
