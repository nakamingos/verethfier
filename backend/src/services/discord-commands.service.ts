import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ChannelType, GuildTextBasedChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Role, Client } from 'discord.js';
import { DbService } from './db.service';
import { DiscordMessageService } from './discord-message.service';
import { DiscordService } from './discord.service';
import { VerificationRule } from '@/models/verification-rule.interface';
import { AdminFeedback } from './utils/admin-feedback.util';

/**
 * DiscordCommandsService
 * 
 * Handles Discord slash command processing for server administration.
 * Provides comprehensive verification rule management through Discord's slash command interface.
 * 
 * Key responsibilities:
 * - Process add-rule commands with validation and confirmation flows
 * - Handle remove-rule commands with safety checks
 * - List and display current verification rules (all types)
 * - Create and update verification messages in channels
 * - Provide rich admin feedback with embedded messages
 * 
 * Command flows include:
 * - Rule creation with duplicate detection and confirmation
 * - Role management (find existing or create new roles)
 * - Channel validation and message posting
 * - Unified rule management for all rule types
 */
@Injectable()
export class DiscordCommandsService {
  // Store pending rules for confirmation flow
  private pendingRules: Map<string, any> = new Map();

  /**
   * Initialize the service with the Discord client.
   * This service doesn't directly use the client but maintains consistency.
   */
  initialize(client: Client): void {
    // No client needed for this service
  }

  constructor(
    private readonly dbSvc: DbService,
    private readonly messageSvc: DiscordMessageService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordSvc: DiscordService
  ) {}

  async handleAddRule(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      // Validate input parameters
      const params = await this.validateInputParams(interaction);
      if (!params) {
        return; // Error already handled
      }

      const { channel, roleName, slug, attributeKey, attributeValue, minItems } = params;

      // Find or create the role
      const role = await this.findOrCreateRole(interaction, roleName);
      if (!role) {
        return; // Error already handled in findOrCreateRole
      }

      // Check for duplicate rules
      if (!(await this.checkForDuplicateRules(interaction, channel, role, slug, attributeKey, attributeValue, minItems))) {
        return; // Duplicate found and handled
      }

      // No duplicate found, proceed with normal rule creation
      await this.createRuleDirectly(interaction, {
        channel,
        role,
        slug,
        attributeKey,
        attributeValue,
        minItems
      });

    } catch (error) {
      Logger.error('Error in handleAddRule:', error);
      if (interaction.deferred) {
        await interaction.editReply('An error occurred while adding the rule.');
      } else {
        await interaction.reply({ 
          content: AdminFeedback.simple('An error occurred while adding the rule.', true), 
          ephemeral: true 
        });
      }
    }
  }

  private async showDuplicateRuleWarning(
    interaction: ChatInputCommandInteraction,
    existingRule: any,
    newRuleData: {
      channel: TextChannel;
      role: Role;
      slug: string;
      attributeKey: string;
      attributeValue: string;
      minItems: number;
    }
  ): Promise<void> {
    // Get the existing role name for display
    const existingRole = await this.discordSvc.getRole(interaction.guild.id, existingRule.role_id);
    
    // Create rule objects for consistent formatting
    const existingRuleFormatted = {
      role_id: existingRule.role_id,
      slug: existingRule.slug,
      attribute_key: existingRule.attribute_key,
      attribute_value: existingRule.attribute_value,
      min_items: existingRule.min_items
    };

    const newRuleFormatted = {
      role_id: newRuleData.role.id,
      slug: newRuleData.slug,
      attribute_key: newRuleData.attributeKey,
      attribute_value: newRuleData.attributeValue,
      min_items: newRuleData.minItems
    };

    const embed = AdminFeedback.warning(
      'Duplicate Rule Criteria',
      'A rule with the same criteria already exists for a different role. Users meeting these criteria will receive **both roles**. This might be intentional (role stacking) or an error.',
      [
        'Click "Create Anyway" to proceed with role stacking',
        'Click "Cancel" to modify your criteria'
      ],
      [
        {
          name: 'Existing Rule',
          value: AdminFeedback.formatRule(existingRuleFormatted, `${existingRole?.name || 'Unknown Role'}`),
          inline: true
        },
        {
          name: 'New Rule (Proposed)',
          value: AdminFeedback.formatRule(newRuleFormatted, newRuleData.role.name),
          inline: true
        }
      ]
    );

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_duplicate_${interaction.id}`)
          .setLabel('Create Anyway')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`cancel_duplicate_${interaction.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

    // Store the new rule data for later use if confirmed
    this.pendingRules.set(interaction.id, newRuleData);

    // Set up button interaction handler
    const filter = (i: any) => i.customId.endsWith(`_${interaction.id}`) && i.user.id === interaction.user.id;
    const collector = interaction.channel?.createMessageComponentCollector({ filter, time: 60000 });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('confirm_duplicate_')) {
        await i.deferUpdate();
        await this.createRuleDirectly(interaction, newRuleData, true);
        this.pendingRules.delete(interaction.id);
      } else if (i.customId.startsWith('cancel_duplicate_')) {
        await i.deferUpdate();
        await interaction.editReply({
          embeds: [AdminFeedback.info('Rule Creation Cancelled', 'The rule was not created.')],
          components: []
        });
        this.pendingRules.delete(interaction.id);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.pendingRules.delete(interaction.id);
        interaction.editReply({
          embeds: [AdminFeedback.info('Request Timed Out', 'Rule creation was cancelled due to timeout.')],
          components: []
        }).catch(() => {}); // Ignore errors if interaction is no longer valid
      }
    });
  }

  private async createRuleDirectly(
    interaction: ChatInputCommandInteraction,
    ruleData: {
      channel: TextChannel;
      role: Role;
      slug: string;
      attributeKey: string;
      attributeValue: string;
      minItems: number;
    },
    isDuplicateConfirmed: boolean = false
  ): Promise<void> {
    const { channel, role, slug, attributeKey, attributeValue, minItems } = ruleData;

    // Check for existing verification setup
    const existingRules = await this.dbSvc.getRulesByChannel(interaction.guild.id, channel.id);
    
    let newRule;
    try {
      newRule = await this.dbSvc.addRoleMapping(
        interaction.guild.id,
        interaction.guild.name,
        channel.id,
        channel.name,
        slug,
        role.id,
        role.name,
        attributeKey,
        attributeValue,
        minItems
      );
    } catch (error) {
      Logger.error('Error creating rule:', error);
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Rule Creation Failed',
          'Failed to create the rule. Please try again.',
          ['Check that all criteria are valid', 'Try again with different settings']
        )],
        components: []
      });
      return;
    }

    const formatAttribute = (key: string, value: string) => {
      if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
      if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
      if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
      return 'ALL';
    };

    if (existingRules.length > 0) {
      // Check if there's already a verification message from our bot in this channel
      const hasExistingMessage = await this.messageSvc.findExistingVerificationMessage(channel);

      // Use existing verification message
      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> ${hasExistingMessage ? 'added using existing verification message' : 'created'}.`,
        [
          { name: 'Collection', value: slug, inline: true },
          { name: 'Attribute', value: AdminFeedback.formatRule(newRule).split('\n')[2].replace('**Attribute:** ', ''), inline: true },
          { name: 'Min Items', value: minItems.toString(), inline: true }
        ]
      );

      if (isDuplicateConfirmed) {
        embed.addFields({
          name: '⚠️ Note',
          value: 'This rule has the same criteria as an existing rule. Users meeting these criteria will receive multiple roles.',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed], components: [] });
    } else {
      // Create new verification message
      await this.createNewVerificationSetup(interaction, channel, role, slug, attributeKey, attributeValue, minItems, isDuplicateConfirmed, newRule);
    }
  }

  private async createNewVerificationSetup(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    role: Role,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    isDuplicateConfirmed: boolean = false,
    newRule: any
  ): Promise<void> {
    try {
      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        await interaction.editReply({
          content: AdminFeedback.simple('Selected channel is not a text or announcement channel.', true),
          components: []
        });
        return;
      }
      
      // Check if there's already a verification message in this channel
      const hasExistingMessage = await this.messageSvc.findExistingVerificationMessage(channel);
      
      let messageCreated = false;
      if (!hasExistingMessage) {
        // Only create a new verification message if one doesn't exist
        await this.messageSvc.createVerificationMessage(channel as GuildTextBasedChannel);
        messageCreated = true;
      }
      
      // No need to track message_id in database anymore

      const formatAttribute = (key: string, value: string) => {
        if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
        if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
        if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
        return 'ALL';
      };

      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> ${messageCreated ? 'added with new verification message' : 'added using existing verification message'}.`,
        [
          { name: 'Collection', value: slug, inline: true },
          { name: 'Attribute', value: formatAttribute(attributeKey, attributeValue), inline: true },
          { name: 'Min Items', value: minItems.toString(), inline: true }
        ]
      );

      if (isDuplicateConfirmed) {
        embed.addFields({
          name: '⚠️ Note',
          value: 'This rule has the same criteria as an existing rule. Users meeting these criteria will receive multiple roles.',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed], components: [] });
    } catch (err) {
      Logger.error('Failed to send Verify Now message', err);
      await interaction.editReply({
        content: AdminFeedback.simple('Failed to send Verify Now message. Please check my permissions and try again.', true),
        components: []
      });
    }
  }

  async handleRemoveRule(interaction: ChatInputCommandInteraction): Promise<void> {
    const ruleId = interaction.options.getInteger('rule_id');
    
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      await this.dbSvc.deleteRoleMapping(String(ruleId), interaction.guild.id);
      await interaction.editReply({
        embeds: [AdminFeedback.success('Rule Removed', `Rule ID ${ruleId} removed.`)]
      });
    } catch (err) {
      await interaction.editReply({
        content: AdminFeedback.simple(`Error: ${err.message}`, true)
      });
    }
  }

  async handleListRules(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Get all verification rules for the server (unified system handles all rule types)
    const allRules = await this.dbSvc.getRoleMappings(interaction.guild.id);
    const rules = allRules.filter(rule => 
      rule.server_id !== '000000000000000000'
    );
    
    let desc = rules.length
      ? rules.map(r =>
          `ID: ${r.id} | Channel: <#${r.channel_id}> | Role: <@&${r.role_id}> | Slug: ${r.slug || 'ALL'} | Attr: ${r.attribute_key && r.attribute_key !== 'ALL' ? (r.attribute_value && r.attribute_value !== 'ALL' ? `${r.attribute_key}=${r.attribute_value}` : `${r.attribute_key} (any value)`) : (r.attribute_value && r.attribute_value !== 'ALL' ? `ALL=${r.attribute_value}` : 'ALL')} | Min: ${r.min_items || 1}`
        ).join('\n')
      : 'No verification rules found.';
    
    await interaction.editReply({
      embeds: [AdminFeedback.info('Verification Rules', desc)]
    });
  }

  /**
   * Recovers verification setup for a channel by creating a new message and updating orphaned rules
   */
  async handleRecoverVerification(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const channel = interaction.options.getChannel('channel');
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply({
          content: AdminFeedback.simple('Please specify a valid text channel.', true)
        });
        return;
      }

      const textChannel = channel as GuildTextBasedChannel;

      // Check if there's already a verification message in the channel
      const hasExistingMessage = await this.messageSvc.findExistingVerificationMessage(textChannel);
      
      if (hasExistingMessage) {
        await interaction.editReply({
          content: AdminFeedback.simple('Channel already has a verification message. No recovery needed.')
        });
        return;
      }

      // Get all rules for this channel
      const channelRules = await this.dbSvc.getRulesByChannel(interaction.guild.id, channel.id);

      if (channelRules.length === 0) {
        await interaction.editReply({
          content: AdminFeedback.simple('No verification rules found for this channel. Use `/setup add-rule` to create rules first.')
        });
        return;
      }

      // Create a new verification message for the channel (no need to update database)
      await this.messageSvc.createVerificationMessage(textChannel);

      // Provide feedback to the admin
      const embed = AdminFeedback.success(
        'Verification Message Created',
        `Successfully created verification message for ${textChannel}`,
        [
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Active Rules', value: `${channelRules.length} rules will use this message`, inline: true },
          { name: 'Roles Affected', value: channelRules.map(r => `<@&${r.role_id}>`).join(', ') || 'None', inline: false }
        ]
      );
      
      embed.setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

      Logger.debug(`Verification message created for channel ${channel.id} with ${channelRules.length} active rules`);

    } catch (error) {
      Logger.error('Error in handleRecoverVerification:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: AdminFeedback.simple(`Error during recovery: ${error.message}`, true)
        });
      } else {
        await interaction.reply({
          content: AdminFeedback.simple(`Error during recovery: ${error.message}`, true),
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }

  /**
   * Validates basic input parameters for rule creation.
   * @returns Input parameters if valid, null if validation failed (error already sent to user)
   */
  private async validateInputParams(interaction: ChatInputCommandInteraction): Promise<{
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
   * Checks for duplicate rules and handles them appropriately
   * @returns true if no duplicates found, false if duplicate found (error already sent to user)
   */
  private async checkForDuplicateRules(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    role: Role,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number
  ): Promise<boolean> {
    // Check for exact duplicate rules first (same role + same criteria)
    const exactDuplicate = await this.dbSvc.checkForExactDuplicateRule(
      interaction.guild.id,
      channel.id,
      slug,
      attributeKey,
      attributeValue,
      minItems,
      role.id
    );

    if (exactDuplicate) {
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Exact Duplicate Rule',
          'This exact rule already exists!',
          [
            'Use different criteria (collection, attribute, or min items)',
            'Remove the existing rule first with `/setup remove-rule`',
            'Check existing rules with `/setup list-rules`'
          ],
          [{
            name: 'Existing Rule',
            value: AdminFeedback.formatRule(exactDuplicate),
            inline: false
          }]
        )]
      });
      return false;
    }

    // Check for duplicate rules with different roles
    const existingRule = await this.dbSvc.checkForDuplicateRule(
      interaction.guild.id,
      channel.id,
      slug,
      attributeKey,
      attributeValue,
      minItems,
      role.id // Exclude the same role (not really duplicate if same role)
    );

    if (existingRule) {
      // Found a matching rule for a different role - warn the admin
      await this.showDuplicateRuleWarning(
        interaction,
        existingRule,
        {
          channel,
          role,
          slug,
          attributeKey,
          attributeValue,
          minItems
        }
      );
      return false;
    }

    return true; // No duplicates found
  }

  /**
   * Finds an existing role or creates a new one
   * @returns Role if successful, null if there was an error (error already sent to user)
   */
  private async findOrCreateRole(
    interaction: ChatInputCommandInteraction, 
    roleName: string
  ): Promise<Role | null> {
    // Try to find existing role (including ones we can't manage)
    let role = interaction.guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleName.toLowerCase()
    );

    // If role exists, check if we can manage it or provide appropriate error
    if (role) {
      if (!role.editable) {
        await interaction.editReply({
          embeds: [AdminFeedback.error(
            'Role Hierarchy Issue',
            `A role named "${roleName}" already exists but is positioned higher than the bot's role. The bot cannot manage this role.`,
            [
              'Use a different role name',
              'Move the bot\'s role higher in the server settings',
              `Ask an admin to move the "${roleName}" role below the bot's role`
            ]
          )]
        });
        return null;
      }
      // Role exists and is manageable - we'll use it
      return role;
    }

    // If role doesn't exist, create it
    // Double-check that no role with this name exists anywhere in the server
    const existingRoleWithName = interaction.guild.roles.cache.find(r => 
      r.name.toLowerCase() === roleName.toLowerCase()
    );
    
    if (existingRoleWithName) {
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Duplicate Role Name',
          `A role named "${roleName}" already exists in this server.`,
          ['Choose a different name for the new role']
        )]
      });
      return null;
    }

    try {
      // Get bot member to determine role position
      const botMember = interaction.guild.members.me;
      let position = undefined;
      
      if (botMember) {
        // Create role below bot's highest role
        const botHighestPosition = botMember.roles.highest.position;
        position = Math.max(1, botHighestPosition - 1);
      }

      role = await interaction.guild.roles.create({
        name: roleName,
        color: 'Blue', // Default color
        position: position,
        reason: `Auto-created for verification rule by ${interaction.user.tag}`
      });
      
      // Send a follow-up message about role creation
      await interaction.followUp({
        content: AdminFeedback.simple(`Created new role: **${role.name}**`),
        ephemeral: true
      });

      return role;
    } catch (error) {
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Role Creation Failed',
          `Failed to create role "${roleName}": ${error.message}`,
          ['Try again with a different role name']
        )]
      });
      return null;
    }
  }
}
