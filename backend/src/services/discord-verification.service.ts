import { Injectable, Logger } from '@nestjs/common';
import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, CacheType, Client, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import { DbService } from './db.service';
import { NonceService } from './nonce.service';
import { DataService } from './data.service';
import { UserAddressService } from './user-address.service';

// Load environment variables
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);
const REPLACED_LINK_NOTICE_TTL_MS = 10_000;

type VerificationRoleResult = {
  roleId: string;
  roleName: string;
  wasAlreadyAssigned: boolean;
  ruleId?: string | null;
  matchingCount?: number;
};

type RuleMatchSummary = {
  ruleId: string;
  matchingCount?: number;
};

type GroupedVerificationRoleResult = {
  roleId: string;
  roleName: string;
  wasAlreadyAssigned: boolean;
  matchedRules: RuleMatchSummary[];
  fallbackMatchingCount?: number;
};

type RoleRequirementGroup = {
  roleId: string;
  roleName: string;
  matchedRules: RuleMatchSummary[];
};

type VerificationDisplayRule = {
  id: number;
  role_id: string;
  role_name?: string | null;
  slug?: string | null;
  min_items?: number | null;
  attribute_key?: string | null;
  attribute_value?: string | null;
};

type CollectionDisplayName = {
  name?: string;
  singleName?: string;
};

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

  private latestRequestNonces: {
    [scopeKey: string]: string;
  } = {};

  private nonceScopes: {
    [nonce: string]: string;
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
    private readonly nonceSvc: NonceService,
    private readonly dataSvc: DataService,
    private readonly userAddressService: UserAddressService
  ) {}

  private getScopeKey(userId: string, guildId: string, channelId: string): string {
    return `${userId}:${guildId}:${channelId}`;
  }

  private scheduleReplyDeletion(interaction: ButtonInteraction<CacheType>, delayMs: number): void {
    const timeout = setTimeout(async () => {
      try {
        await interaction.deleteReply();
      } catch (error) {
        Logger.warn(`Failed to delete superseded verification reply: ${error.message}`);
      }
    }, delayMs);

    // Avoid keeping the process alive just for cleanup of an ephemeral message.
    timeout.unref?.();
  }

  private async retirePreviousVerificationRequest(scopeKey: string): Promise<void> {
    const previousNonce = this.latestRequestNonces[scopeKey];
    if (!previousNonce) return;

    const previousInteraction = this.tempMessages[previousNonce];
    if (!previousInteraction) {
      delete this.latestRequestNonces[scopeKey];
      delete this.nonceScopes[previousNonce];
      return;
    }

    try {
      if (!previousInteraction.isRepliable()) {
        Logger.warn(`Previous interaction for nonce ${previousNonce} is no longer repliable`);
        return;
      }

      await previousInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Link Replaced')
            .setDescription('A newer verification link was requested. Please use the latest "Verify Now" button. This notice will disappear shortly.')
            .setColor('#FFA500')
        ],
        components: []
      });

      this.scheduleReplyDeletion(previousInteraction, REPLACED_LINK_NOTICE_TTL_MS);
    } catch (error) {
      Logger.warn(`Failed to retire previous verification request for nonce ${previousNonce}: ${error.message}`);
    } finally {
      delete this.tempMessages[previousNonce];
      delete this.nonceScopes[previousNonce];
      delete this.latestRequestNonces[scopeKey];
    }
  }

  private clearTrackedRequest(nonce: string): void {
    const scopeKey = this.nonceScopes[nonce];
    if (scopeKey && this.latestRequestNonces[scopeKey] === nonce) {
      delete this.latestRequestNonces[scopeKey];
    }

    delete this.nonceScopes[nonce];
    delete this.tempMessages[nonce];
  }

  private parseRuleSlugs(slug?: string | null): string[] {
    if (!slug || slug === 'ALL' || slug === 'all-collections') {
      return [];
    }

    return slug
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0);
  }

  private humanizeSlug(slug: string): string {
    return slug
      .split(/[-_]+/)
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private humanizeAttributeKey(attributeKey: string): string {
    if (!attributeKey.includes('_') && !attributeKey.includes('-')) {
      return attributeKey;
    }

    return attributeKey
      .split(/[_-]+/)
      .filter(part => part.length > 0)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private formatCollectionLabel(
    rule: {
      slug?: string | null;
      attribute_key?: string | null;
      attribute_value?: string | null;
    },
    collectionNames: Record<string, CollectionDisplayName> = {}
  ): string {
    const slugs = this.parseRuleSlugs(rule.slug);
    if (slugs.length === 0) {
      return '';
    }

    const useCollectionName =
      (!rule.attribute_key || rule.attribute_key === 'ALL') &&
      (!rule.attribute_value || rule.attribute_value === 'ALL');
    const separator = useCollectionName && slugs.length > 1 ? '\u00A0\u2228 ' : (useCollectionName ? ' ∨ ' : ', ');

    return slugs
      .map(value => {
        const collectionName = collectionNames[value];
        let label = '';
        if (!collectionName) {
          label = this.humanizeSlug(value);
        } else if (useCollectionName && collectionName.name) {
          label = collectionName.name;
        } else if (collectionName.singleName) {
          label = collectionName.singleName;
        } else if (collectionName.name) {
          label = collectionName.name;
        } else {
          label = this.humanizeSlug(value);
        }

        return useCollectionName && slugs.length > 1
          ? this.keepPhraseTogether(label)
          : label;
      })
      .join(separator);
  }

  private async getCollectionNamesForRules(
    rules: Array<{ slug?: string | null }>
  ): Promise<Record<string, CollectionDisplayName>> {
    const uniqueSlugs = Array.from(new Set(
      rules.flatMap(rule => this.parseRuleSlugs(rule.slug))
    ));

    if (uniqueSlugs.length === 0) {
      return {};
    }

    try {
      return await this.dataSvc.getCollectionNames(uniqueSlugs);
    } catch (error) {
      Logger.warn(`Failed to load collection names for verification messaging: ${error.message}`);
      return {};
    }
  }

  private formatRoleRequirement(
    rule: {
      slug?: string | null;
      min_items?: number | null;
      attribute_key?: string | null;
      attribute_value?: string | null;
    },
    collectionNames: Record<string, CollectionDisplayName> = {},
    options: {
      style?: 'requirement' | 'holding';
      matchingCount?: number;
    } = {}
  ): string {
    const minItems = rule.min_items || 1;
    const style = options.style || 'requirement';
    const matchingCount = options.matchingCount;
    const collectionLabel = this.formatCollectionLabel(rule, collectionNames);
    const slugCount = this.parseRuleSlugs(rule.slug).length;
    const hasAttributeFilter =
      !!rule.attribute_key &&
      rule.attribute_key !== 'ALL' &&
      !!rule.attribute_value &&
      rule.attribute_value !== 'ALL';
    const currentCount = typeof matchingCount === 'number' ? matchingCount : minItems;
    const shouldShowRequirementProgress =
      style === 'requirement' &&
      typeof matchingCount === 'number' &&
      (
        minItems > 1 ||
        !hasAttributeFilter
      );

    if (collectionLabel) {
      if (style === 'holding' && !hasAttributeFilter) {
        return `(${currentCount}/${minItems}) ${collectionLabel}`;
      }

      const quantity = style === 'holding' ? currentCount : minItems;
      const collectionReference = this.formatCollectionReference(
        collectionLabel,
        quantity,
        style,
        {
          prefersDirectNoun: hasAttributeFilter && slugCount === 1,
          isMultiCollection: slugCount > 1,
          isCollectionOnly: !hasAttributeFilter,
        }
      );
      let requirement = style === 'holding'
        ? `${quantity} ${collectionReference}`
        : `Own ${minItems}+ ${collectionReference}`;

      if (hasAttributeFilter) {
        requirement += ` with ${this.humanizeAttributeKey(rule.attribute_key!)}: ${rule.attribute_value}`;
      }

      if (shouldShowRequirementProgress) {
        requirement += ` (${matchingCount}/${minItems})`;
      }

      return requirement;
    }

    if (rule.attribute_key && rule.attribute_key !== 'ALL') {
      let requirement = style === 'holding'
        ? `${currentCount} NFTs with ${this.humanizeAttributeKey(rule.attribute_key)}`
        : `Own ${minItems}+ NFTs with ${this.humanizeAttributeKey(rule.attribute_key)}`;
      if (rule.attribute_value && rule.attribute_value !== 'ALL') {
        requirement += `: ${rule.attribute_value}`;
      }
      if (shouldShowRequirementProgress) {
        requirement += ` (${matchingCount}/${minItems})`;
      }
      return requirement;
    }

    if (style === 'holding') {
      return `(${currentCount}/${minItems}) any collection`;
    }

    const countSuffix = typeof matchingCount === 'number' && (minItems > 1 || matchingCount === 0)
      ? ` (${matchingCount}/${minItems})`
      : '';
    return `Own ${minItems}+ NFTs from any collection${countSuffix}`;
  }

  private keepPhraseTogether(text: string): string {
    return text.replace(/ /g, '\u00A0');
  }

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

      const scopeKey = this.getScopeKey(interaction.user.id, guild.id, channel.id);
      await this.retirePreviousVerificationRequest(scopeKey);

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
        interaction.guild.id,
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
      this.nonceScopes[nonce] = scopeKey;
      this.latestRequestNonces[scopeKey] = nonce;
      
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
  ): Promise<VerificationRoleResult> {
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
      wasAlreadyAssigned,
      ruleId: ruleId || null
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
      this.clearTrackedRequest(nonce);
    }
  }

  /**
   * Sends a verification complete message showing all assigned roles and potential roles
   */
  async sendVerificationComplete(
    guildId: string,
    nonce: string,
    roleResults: VerificationRoleResult[],
    userAddress?: string
  ): Promise<void> {
    if (!this.client) throw new Error('Discord bot not initialized');

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) throw new Error('Guild not found');

    const storedInteraction = this.tempMessages[nonce];
    if (!storedInteraction) {
      throw new Error('No stored interaction found for this nonce');
    }

    try {
      const groupedRoleResults = this.groupRoleResults(roleResults);

      // Separate roles into newly assigned and already possessed
      const newRoles = groupedRoleResults.filter(r => !r.wasAlreadyAssigned);
      const existingRoles = groupedRoleResults.filter(r => r.wasAlreadyAssigned);
      
      let description = `You have been successfully verified in ${guild.name}`;
      
      // Get rule details for all assigned roles to show requirements
      const allRules = await this.dbSvc.getRoleMappings(guildId);
      const collectionNames = await this.getCollectionNamesForRules(allRules);
      
      // Add new roles section if any
      if (newRoles.length > 0) {
        description += `\n\n**🎉 New Roles Assigned:**\n${newRoles.map(r => {
          const requirement = this.getPrimaryRoleRequirement(r, allRules, collectionNames);
          return this.formatRoleDisplay(r.roleName, requirement ? [requirement] : []);
        }).join('\n')}`;
      }
      
      // Add existing roles section if any
      if (existingRoles.length > 0) {
        description += `\n\n**✅ Roles You Already Have:**\n${existingRoles.map(r => {
          return this.formatExistingRoleDisplay(r, allRules, collectionNames);
        }).join('\n')}`;
      }
      
      // Add role recommendations if we have user address and there are unassigned roles
      if (userAddress && storedInteraction?.user?.id) {
        Logger.log(`🔍 Analyzing potential roles for user ${storedInteraction.user.id} with address ${userAddress}`);
        try {
          const assignedRoleIds = groupedRoleResults.map(r => r.roleId);
          Logger.log(`📋 Assigned role IDs: ${assignedRoleIds.join(', ')}`);
          
          const potentialRoles = await this.analyzePotentialRoles(guildId, storedInteraction.user.id, assignedRoleIds, userAddress);
          Logger.log(`🚀 Found ${potentialRoles.length} potential roles:`, potentialRoles);
          
          if (potentialRoles.length > 0) {
            description += `\n\n**🚀 Additional Roles Available:**\n${potentialRoles.map(r => this.formatRequirementGroupDisplay(r, allRules, collectionNames)).join('\n')}`;
            Logger.log(`✅ Added role recommendations to description`);
          } else {
            Logger.log(`ℹ️ No additional roles available for recommendation`);
          }
        } catch (error) {
          Logger.error('Failed to get role recommendations:', error);
          // Don't fail the verification if recommendations fail
        }
      } else {
        Logger.log(`⚠️ Skipping role recommendations - userAddress: ${!!userAddress}, userId: ${storedInteraction?.user?.id}`);
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
      this.clearTrackedRequest(nonce);
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

  /**
   * Analyze verification roles the user does not currently have.
   *
   * This powers the "Additional Roles Available" section by showing every
   * remaining verifier role for the server and attaching progress counts when
   * the user has any matching holdings.
   */
  async analyzePotentialRoles(
    guildId: string, 
    userId: string,
    assignedRoleIds: string[],
    address: string
  ): Promise<RoleRequirementGroup[]> {
    if (!this.client) {
      Logger.log(`❌ analyzePotentialRoles: Discord client not initialized`);
      return [];
    }

    try {
      Logger.log(`🔍 analyzePotentialRoles: Starting analysis for guild ${guildId}`);

      const guild = await this.client.guilds.fetch(guildId);

      let excludedRoleIds = new Set(assignedRoleIds);
      try {
        const member = await guild.members.fetch(userId);
        const currentDiscordRoleIds = Array.from(member.roles.cache.keys());
        excludedRoleIds = new Set([...currentDiscordRoleIds, ...assignedRoleIds]);
        Logger.log(`👤 User currently has ${excludedRoleIds.size} excluded roles in Discord/current verification: ${Array.from(excludedRoleIds).join(', ')}`);
      } catch (memberError) {
        Logger.warn(`Falling back to database role history for user ${userId} in guild ${guildId}: ${memberError.message}`);

        const userActiveAssignments = await this.dbSvc.getUserRoleHistory(userId, guildId);
        const activeAssignments = userActiveAssignments.filter(assignment => assignment.status === 'active');
        const userCurrentRoleIds = activeAssignments.map(assignment => assignment.role_id);
        excludedRoleIds = new Set([...userCurrentRoleIds, ...assignedRoleIds]);
        Logger.log(`👤 User currently has ${excludedRoleIds.size} excluded roles in database/current verification: ${Array.from(excludedRoleIds).join(', ')}`);
      }
      
      // Get all rules for this server
      const allRules = await this.dbSvc.getRoleMappings(guildId);
      Logger.log(`📋 Found ${allRules.length} total rules in server`);
      
      // Filter out rules for roles they already have or were just assigned in this verification
      const unassignedRules = allRules.filter(rule => !excludedRoleIds.has(rule.role_id));
      Logger.log(`🎯 Found ${unassignedRules.length} unassigned rules after filtering out current database roles`);
      if (unassignedRules.length === 0) {
        return [];
      }

      const userAddresses = await this.userAddressService.getUserAddresses(userId);
      const normalizedAddress = address.toLowerCase();
      const addressesToCheck = userAddresses.includes(normalizedAddress)
        ? userAddresses
        : [...userAddresses, normalizedAddress];

      const remainingRules = [];
      const ruleEvaluations: Array<Record<string, unknown>> = [];
      for (const rule of unassignedRules) {
        try {
          const matchingCount = await this.dataSvc.checkAssetOwnershipWithCriteria(
            addressesToCheck,
            rule.slug || 'ALL',
            rule.attribute_key || 'ALL',
            rule.attribute_value || 'ALL',
            1
          );

          ruleEvaluations.push({
            ruleId: rule.id,
            roleId: rule.role_id,
            roleName: rule.role_name || null,
            slug: rule.slug || 'ALL',
            attributeKey: rule.attribute_key || 'ALL',
            attributeValue: rule.attribute_value || 'ALL',
            minItems: rule.min_items || 1,
            matchingCount,
          });

          remainingRules.push({
            ...rule,
            matchingCount,
          });
        } catch (error) {
          ruleEvaluations.push({
            ruleId: rule.id,
            roleId: rule.role_id,
            roleName: rule.role_name || null,
            slug: rule.slug || 'ALL',
            attributeKey: rule.attribute_key || 'ALL',
            attributeValue: rule.attribute_value || 'ALL',
            minItems: rule.min_items || 1,
            error: error.message,
          });
          Logger.error(`❌ Error checking availability for rule ${rule.id}:`, error);
        }
      }

      Logger.log(`✅ Evaluated ${remainingRules.length} unassigned rules for additional-role messaging`);
      if (remainingRules.length === 0) {
        Logger.warn(
          `No additional roles surfaced for user ${userId} in guild ${guildId}. ` +
          `Checked ${ruleEvaluations.length} unassigned rules across ${addressesToCheck.length} wallet(s): ` +
          `${JSON.stringify(ruleEvaluations)}`
        );
        return [];
      }

      const groupedPotentialRoles = this.groupRulesByRole(remainingRules);
      
      const potentialRoles: RoleRequirementGroup[] = [];
      for (const groupedRole of groupedPotentialRoles) {
        try {
          Logger.log(`🔎 Processing qualifying role ${groupedRole.roleId}`);

          const role = await guild.roles.fetch(groupedRole.roleId);
          
          if (!role) {
            Logger.log(`⚠️ Role ${groupedRole.roleId} not found in Discord`);
            continue;
          }

          potentialRoles.push({
            roleId: groupedRole.roleId,
            roleName: role.name,
            matchedRules: groupedRole.matchedRules,
          });
        } catch (error) {
          Logger.error(`❌ Error processing potential role ${groupedRole.roleId}:`, error);
          // Skip roles we can't process
          continue;
        }
      }
      
      Logger.log(`🎉 analyzePotentialRoles completed with ${potentialRoles.length} recommendations`);
      return potentialRoles;
    } catch (error) {
      Logger.error('❌ Error analyzing potential roles:', error);
      return [];
    }
  }

  private groupRoleResults(roleResults: VerificationRoleResult[]): GroupedVerificationRoleResult[] {
    const groupedResults = new Map<string, GroupedVerificationRoleResult>();

    roleResults.forEach(roleResult => {
      const existing = groupedResults.get(roleResult.roleId);
      if (!existing) {
        groupedResults.set(roleResult.roleId, {
          roleId: roleResult.roleId,
          roleName: roleResult.roleName,
          wasAlreadyAssigned: roleResult.wasAlreadyAssigned,
          fallbackMatchingCount: roleResult.ruleId ? undefined : roleResult.matchingCount,
          matchedRules: roleResult.ruleId ? [{
            ruleId: roleResult.ruleId,
            matchingCount: roleResult.matchingCount,
          }] : [],
        });
        return;
      }

      existing.wasAlreadyAssigned = existing.wasAlreadyAssigned && roleResult.wasAlreadyAssigned;
      if (
        !roleResult.ruleId &&
        typeof roleResult.matchingCount === 'number' &&
        typeof existing.fallbackMatchingCount !== 'number'
      ) {
        existing.fallbackMatchingCount = roleResult.matchingCount;
      }
      if (roleResult.ruleId && !existing.matchedRules.some(match => match.ruleId === roleResult.ruleId)) {
        existing.matchedRules.push({
          ruleId: roleResult.ruleId,
          matchingCount: roleResult.matchingCount,
        });
      }
    });

    return Array.from(groupedResults.values());
  }

  private getMatchedRulesForRole(
    role: { roleId: string; matchedRules: RuleMatchSummary[]; fallbackMatchingCount?: number },
    allRules: VerificationDisplayRule[]
  ): Array<{ rule: VerificationDisplayRule; matchingCount?: number }> {
    if (role.matchedRules.length > 0) {
      const rulesById = new Map(allRules.map(rule => [rule.id.toString(), rule]));
      const matchedRules = role.matchedRules.flatMap(match => {
        const rule = rulesById.get(match.ruleId);
        return rule ? [{ rule, matchingCount: match.matchingCount }] : [];
      });

      if (matchedRules.length > 0) {
        return matchedRules;
      }
    }

    const fallbackRule = allRules.find(rule => rule.role_id === role.roleId);
    return fallbackRule ? [{ rule: fallbackRule, matchingCount: role.fallbackMatchingCount }] : [];
  }

  private getPrimaryRoleRequirement(
    role: GroupedVerificationRoleResult,
    allRules: VerificationDisplayRule[],
    collectionNames: Record<string, CollectionDisplayName>
  ): string {
    const [primaryRule] = this.getMatchedRulesForRole(role, allRules);
    return primaryRule
      ? this.formatRoleRequirement(primaryRule.rule, collectionNames, {
          style: 'requirement',
          matchingCount: primaryRule.matchingCount,
        })
      : '';
  }

  private formatRequirementGroupDisplay(
    role: { roleId: string; roleName: string; matchedRules: RuleMatchSummary[] },
    allRules: VerificationDisplayRule[],
    collectionNames: Record<string, CollectionDisplayName>
  ): string {
    const requirements = Array.from(new Set(
      this.getMatchedRulesForRole(role, allRules)
        .map(({ rule, matchingCount }) => this.formatRoleRequirement(
          rule,
          collectionNames,
          {
            style: 'requirement',
            matchingCount,
          }
        ))
        .filter(requirement => requirement.length > 0)
    ));

    return this.formatRoleDisplay(role.roleName, requirements);
  }

  private groupRulesByRole(
    rules: Array<VerificationDisplayRule & { matchingCount?: number }>
  ): RoleRequirementGroup[] {
    const groupedRoles = new Map<string, RoleRequirementGroup>();

    rules.forEach(rule => {
      const existing = groupedRoles.get(rule.role_id);
      if (!existing) {
        groupedRoles.set(rule.role_id, {
          roleId: rule.role_id,
          roleName: '',
          matchedRules: [{
            ruleId: rule.id.toString(),
            matchingCount: rule.matchingCount,
          }],
        });
        return;
      }

      if (!existing.matchedRules.some(match => match.ruleId === rule.id.toString())) {
        existing.matchedRules.push({
          ruleId: rule.id.toString(),
          matchingCount: rule.matchingCount,
        });
      }
    });

    return Array.from(groupedRoles.values());
  }

  private formatCollectionReference(
    collectionLabel: string,
    quantity: number,
    style: 'requirement' | 'holding',
    options: {
      prefersDirectNoun: boolean;
      isMultiCollection: boolean;
      isCollectionOnly: boolean;
    }
  ): string {
    if (options.isMultiCollection) {
      const itemWord = quantity === 1 ? 'item' : 'items';
      return `${itemWord} from ${collectionLabel}`;
    }

    if (options.prefersDirectNoun) {
      return this.pluralizeCollectionLabel(collectionLabel, quantity);
    }

    if (options.isCollectionOnly) {
      const itemWord = style === 'holding'
        ? (quantity === 1 ? 'item' : 'items')
        : `item${quantity > 1 ? 's' : ''}`;
      return `${itemWord} from ${collectionLabel}`;
    }

    return this.pluralizeCollectionLabel(collectionLabel, quantity);
  }

  private pluralizeCollectionLabel(collectionLabel: string, quantity: number): string {
    if (quantity === 1) {
      return collectionLabel;
    }

    if (collectionLabel.trim().toLowerCase().endsWith('s')) {
      return collectionLabel;
    }

    const labelParts = collectionLabel.split(' ');
    const lastPartIndex = labelParts.length - 1;
    labelParts[lastPartIndex] = `${labelParts[lastPartIndex]}s`;
    return labelParts.join(' ');
  }

  private formatExistingRoleDisplay(
    role: GroupedVerificationRoleResult,
    allRules: VerificationDisplayRule[],
    collectionNames: Record<string, CollectionDisplayName>
  ): string {
    const matchedRules = this.getMatchedRulesForRole(role, allRules);
    const combinedCollectionRequirement = this.formatCombinedCollectionHoldingRequirement(
      matchedRules,
      collectionNames
    );
    if (combinedCollectionRequirement) {
      return this.formatRoleDisplay(role.roleName, [combinedCollectionRequirement]);
    }

    const requirements = Array.from(new Set(
      matchedRules
        .map(({ rule, matchingCount }) => this.formatRoleRequirement(
          rule,
          collectionNames,
          {
            style: 'holding',
            matchingCount,
          }
        ))
        .filter(requirement => requirement.length > 0)
    ));

    return this.formatRoleDisplay(role.roleName, requirements);
  }

  private formatCombinedCollectionHoldingRequirement(
    matchedRules: Array<{ rule: VerificationDisplayRule; matchingCount?: number }>,
    collectionNames: Record<string, CollectionDisplayName>
  ): string | null {
    if (
      matchedRules.length <= 1 ||
      !matchedRules.every(({ rule }) => this.isCollectionOnlyRule(rule))
    ) {
      return null;
    }

    const requirements = Array.from(new Set(
      matchedRules
        .map(({ rule, matchingCount }) => this.keepPhraseTogether(
          this.formatRoleRequirement(rule, collectionNames, {
            style: 'holding',
            matchingCount,
          })
        ))
        .filter(requirement => requirement.length > 0)
    ));

    return requirements.length > 1 ? requirements.join('\u00A0\u2228 ') : null;
  }

  private isCollectionOnlyRule(
    rule: Pick<VerificationDisplayRule, 'slug' | 'attribute_key' | 'attribute_value'>
  ): boolean {
    const hasAttributeFilter =
      !!rule.attribute_key &&
      rule.attribute_key !== 'ALL' &&
      !!rule.attribute_value &&
      rule.attribute_value !== 'ALL';

    return !hasAttributeFilter && this.parseRuleSlugs(rule.slug).length > 0;
  }

  private formatRoleDisplay(roleName: string, requirements: string[]): string {
    if (requirements.length === 0) {
      return `**${roleName}**`;
    }

    if (requirements.length === 1 && this.shouldInlineSingleRequirement(roleName, requirements[0])) {
      return `**${roleName}**: ${requirements[0]}`;
    }

    return `**${roleName}**:\n${requirements.map(requirement => ` ↳ ${requirement}`).join('\n')}`;
  }

  private shouldInlineSingleRequirement(roleName: string, requirement: string): boolean {
    const preferredInlineWidth = 88;
    return (
      !requirement.includes('\n') &&
      (
        requirement.includes('\u2228') ||
        `${roleName}: ${requirement}`.length <= preferredInlineWidth
      )
    );
  }
}
