import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ChannelType, GuildTextBasedChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Role, Client, ComponentType, ButtonInteraction } from 'discord.js';
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
  // Store confirmation data for Edit and Undo functionality
  private confirmationData: Map<string, any> = new Map();
  // Store removed rule data for undo functionality
  private removedRules: Map<string, any> = new Map();
  // Store cancelled rule data for undo functionality
  private cancelledRules: Map<string, any> = new Map();
  // Store restored rule data for undo functionality
  private restoredRules: Map<string, any> = new Map();

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
      const roleResult = await this.findOrCreateRole(interaction, roleName);
      if (!roleResult) {
        return; // Error already handled in findOrCreateRole
      }
      
      const { role, wasNewlyCreated } = roleResult;

      // Check for duplicate rules
      if (!(await this.checkForDuplicateRules(interaction, channel, role, slug, attributeKey, attributeValue, minItems, wasNewlyCreated))) {
        return; // Duplicate found and handled
      }

      // No duplicate found, proceed with normal rule creation
      await this.createRuleDirectly(interaction, {
        channel,
        role,
        slug,
        attributeKey,
        attributeValue,
        minItems,
        wasNewlyCreated
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
      wasNewlyCreated?: boolean;
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
        
        // Store the cancelled rule data for undo functionality
        this.cancelledRules.set(interaction.id, newRuleData);
        
        // Create detailed rule info fields for the cancelled rule
        const cancelledRuleFormatted = {
          role_id: newRuleData.role.id,
          role_name: newRuleData.role.name,
          channel_name: newRuleData.channel.name,
          slug: newRuleData.slug,
          attribute_key: newRuleData.attributeKey,
          attribute_value: newRuleData.attributeValue,
          min_items: newRuleData.minItems
        };
        const ruleInfoFields = this.createRuleInfoFields(cancelledRuleFormatted);
        const embed = AdminFeedback.info('Rule Creation Cancelled', `Rule for ${newRuleData.channel.name} and @${newRuleData.role.name} was not created.`);
        embed.addFields(ruleInfoFields);
        
        // Create Undo button
        const undoButton = this.createUndoRemovalButton(interaction.id, 'cancellation');
        
        await interaction.editReply({
          embeds: [embed],
          components: [undoButton]
        });
        
        // Set up button interaction handler for undo cancellation
        this.setupCancellationButtonHandler(interaction);
        
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
      wasNewlyCreated?: boolean;
    },
    isDuplicateConfirmed: boolean = false
  ): Promise<void> {
    const { channel, role, slug, attributeKey, attributeValue, minItems, wasNewlyCreated = false } = ruleData;

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
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> ${hasExistingMessage ? 'has been added using existing verification message' : 'created'}.`,
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

      // Store confirmation data for Undo functionality
      const confirmationInfo = {
        ruleId: newRule.id,
        serverId: interaction.guild.id,
        channel,
        role,
        slug,
        attributeKey,
        attributeValue,
        minItems,
        wasNewlyCreated
      };
      this.confirmationData.set(interaction.id, confirmationInfo);

      // Create Undo button
      const actionButtons = this.createConfirmationButtons(interaction.id);

      await interaction.editReply({ 
        embeds: [embed], 
        components: [actionButtons]
      });

      // Set up button interaction handler with timeout
      this.setupConfirmationButtonHandler(interaction);
    } else {
      // Create new verification message
      await this.createNewVerificationSetup(interaction, channel, role, slug, attributeKey, attributeValue, minItems, isDuplicateConfirmed, newRule, wasNewlyCreated);
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
    newRule: any,
    wasNewlyCreated: boolean = false
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
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> ${messageCreated ? 'has been added with new verification message' : 'has been added using existing verification message'}.`,
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

      // Store confirmation data for Undo functionality
      const confirmationInfo = {
        ruleId: newRule.id,
        serverId: interaction.guild.id,
        channel,
        role,
        slug,
        attributeKey,
        attributeValue,
        minItems,
        wasNewlyCreated
      };
      this.confirmationData.set(interaction.id, confirmationInfo);

      // Create Undo button
      const actionButtons = this.createConfirmationButtons(interaction.id);

      await interaction.editReply({ 
        embeds: [embed], 
        components: [actionButtons]
      });

      // Set up button interaction handler with timeout
      this.setupConfirmationButtonHandler(interaction);
    } catch (err) {
      Logger.error('Failed to send Verify Now message', err);
      await interaction.editReply({
        content: AdminFeedback.simple('Failed to send Verify Now message. Please check my permissions and try again.', true),
        components: []
      });
    }
  }

  async handleRemoveRule(interaction: ChatInputCommandInteraction): Promise<void> {
    const ruleIdInput = interaction.options.getString('rule_id');
    
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    if (!ruleIdInput) {
      await interaction.editReply({
        content: AdminFeedback.simple('Rule ID is required.', true)
      });
      return;
    }

    try {
      // Parse comma-separated rule IDs (handle both "1,2,3" and "1, 2, 3" formats)
      const ruleIds = ruleIdInput
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0)
        .map(id => {
          const parsed = parseInt(id, 10);
          if (isNaN(parsed)) {
            throw new Error(`"${id}" is not a valid rule ID`);
          }
          return parsed;
        });

      if (ruleIds.length === 0) {
        await interaction.editReply({
          content: AdminFeedback.simple('No valid rule IDs provided.', true)
        });
        return;
      }

      // Get all rules for the server
      const allRules = await this.dbSvc.getRoleMappings(interaction.guild.id);
      
      // Find rules to remove and validate they exist
      const rulesToRemove = [];
      const notFoundIds = [];
      
      for (const ruleId of ruleIds) {
        const ruleToRemove = allRules.find(rule => rule.id === ruleId);
        if (ruleToRemove) {
          rulesToRemove.push({ id: ruleId, data: ruleToRemove });
        } else {
          notFoundIds.push(ruleId);
        }
      }

      // Handle not found rules
      if (notFoundIds.length > 0) {
        const notFoundMessage = notFoundIds.length === 1 
          ? `Rule ${notFoundIds[0]} not found.`
          : `Rules ${notFoundIds.join(', ')} not found.`;
          
        if (rulesToRemove.length === 0) {
          // No valid rules to remove
          await interaction.editReply({
            content: AdminFeedback.simple(notFoundMessage, true)
          });
          return;
        } else {
          // Some valid rules, show warning but continue
          await interaction.followUp({
            content: AdminFeedback.simple(`⚠️ ${notFoundMessage}`, true),
            ephemeral: true
          });
        }
      }

      // Delete rules from database
      const deletionResults = [];
      for (const { id, data } of rulesToRemove) {
        try {
          await this.dbSvc.deleteRoleMapping(String(id), interaction.guild.id);
          deletionResults.push({ id, data, success: true });
        } catch (error) {
          deletionResults.push({ id, data, success: false, error: error.message });
        }
      }

      // Handle results
      const successful = deletionResults.filter(r => r.success);
      const failed = deletionResults.filter(r => !r.success);

      if (successful.length === 1 && failed.length === 0) {
        // Single successful removal - use existing single rule method
        await this.sendRuleRemovedMessage(
          interaction,
          successful[0].id,
          successful[0].data,
          { ephemeral: true, isReply: false }
        );
      } else {
        // Multiple rules or mixed results - use new bulk method
        await this.sendBulkRuleRemovedMessage(
          interaction,
          successful,
          failed,
          { ephemeral: true, isReply: false }
        );
      }

    } catch (error) {
      await interaction.editReply({
        content: AdminFeedback.simple(`Error: ${error.message}`, true)
      });
    }
  }

  async handleListRules(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Get all verification rules for the server (unified system handles all rule types)
    const allRules = await this.dbSvc.getRoleMappings(interaction.guild.id);
    const rules = allRules
      .filter(rule => rule.server_id !== '000000000000000000')
      .sort((a, b) => a.id - b.id); // Sort by Rule ID in ascending order
    
    let desc = rules.length
      ? rules.map(r =>
          `ID: ${r.id} | Channel: <#${r.channel_id}> | Role: <@&${r.role_id}> | Slug: ${r.slug || 'ALL'} | Attr: ${r.attribute_key && r.attribute_key !== 'ALL' ? (r.attribute_value && r.attribute_value !== 'ALL' ? `${r.attribute_key}=${r.attribute_value}` : `${r.attribute_key} (any value)`) : (r.attribute_value && r.attribute_value !== 'ALL' ? `ALL=${r.attribute_value}` : 'ALL')} | Min: ${r.min_items || 1}`
        ).join('\n\n')
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
    minItems: number,
    wasNewlyCreated: boolean = false
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
          minItems,
          wasNewlyCreated
        }
      );
      return false;
    }

    // Check for duplicate roles (same role with different criteria)
    const existingRoleRule = await this.dbSvc.checkForDuplicateRole(
      interaction.guild.id,
      role.id,
      channel.id,
      slug,
      attributeKey,
      attributeValue,
      minItems
    );

    if (existingRoleRule) {
      // Found a rule for this role with different criteria - warn the admin
      await this.showDuplicateRoleWarning(
        interaction,
        existingRoleRule,
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
  ): Promise<{ role: Role; wasNewlyCreated: boolean } | null> {
    // Strip @ prefix if present (users can enter @RoleName or RoleName)
    const cleanRoleName = roleName.startsWith('@') ? roleName.slice(1) : roleName;
    
    // Try to find existing role (including ones we can't manage)
    let role = interaction.guild.roles.cache.find(r => 
      r.name.toLowerCase() === cleanRoleName.toLowerCase()
    );

    // If role exists, check if we can manage it or provide appropriate error
    if (role) {
      if (!role.editable) {
        await interaction.editReply({
          embeds: [AdminFeedback.error(
            'Role Hierarchy Issue',
            `A role named "${cleanRoleName}" already exists but is positioned higher than the bot's role. The bot cannot manage this role.`,
            [
              'Use a different role name',
              'Move the bot\'s role higher in the server settings',
              `Ask an admin to move the "${cleanRoleName}" role below the bot's role`
            ]
          )]
        });
        return null;
      }
      // Role exists and is manageable - we'll use it
      return { role, wasNewlyCreated: false };
    }

    // If role doesn't exist, create it
    // Double-check that no role with this name exists anywhere in the server
    const existingRoleWithName = interaction.guild.roles.cache.find(r => 
      r.name.toLowerCase() === cleanRoleName.toLowerCase()
    );
    
    if (existingRoleWithName) {
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Duplicate Role Name',
          `A role named "${cleanRoleName}" already exists in this server.`,
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
        name: cleanRoleName,
        color: 'Blue', // Default color
        position: position,
        reason: `Auto-created for verification rule by ${interaction.user.tag}`
      });
      
      // Send a follow-up message about role creation
      await interaction.followUp({
        content: AdminFeedback.simple(`Created new role: **${role.name}**`),
        ephemeral: true
      });

      return { role, wasNewlyCreated: true };
    } catch (error) {
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Role Creation Failed',
          `Failed to create role "${cleanRoleName}": ${error.message}`,
          ['Try again with a different role name']
        )]
      });
      return null;
    }
  }

  /**
   * Universal method to send "Rule Removed" message with Undo button
   * This ensures all rule removal scenarios have consistent Undo functionality
   */
  private async sendRuleRemovedMessage(
    interaction: any,
    ruleId: number,
    removedRuleData: any,
    options: {
      ephemeral?: boolean;
      isReply?: boolean;
    } = {}
  ): Promise<void> {
    const { ephemeral = true, isReply = true } = options;
    
    // Store the removed rule data for undo functionality
    this.removedRules.set(interaction.id, removedRuleData);

    // Create Undo button
    const undoButton = this.createUndoRemovalButton(interaction.id, 'removal');
    
    // Create detailed rule info fields
    const ruleInfoFields = this.createRuleInfoFields(removedRuleData);
    const embed = AdminFeedback.success('Rule Removed', `Rule ${ruleId} for ${removedRuleData.channel_name} and @${removedRuleData.role_name} has been removed.`);
    embed.addFields(ruleInfoFields);

    const messageContent = {
      embeds: [embed],
      components: [undoButton],
      ...(ephemeral && { ephemeral: true })
    };

    if (isReply) {
      await interaction.reply(messageContent);
    } else {
      await interaction.editReply(messageContent);
    }

    // Set up button interaction handler for undo removal
    this.setupRemovalButtonHandler(interaction);
  }

  /**
   * Sends "Multiple Rules Removed" message with Undo button for bulk operations
   * This ensures bulk rule removal scenarios have consistent Undo functionality
   */
  private async sendBulkRuleRemovedMessage(
    interaction: any,
    successful: Array<{ id: number; data: any; success: true }>,
    failed: Array<{ id: number; data: any; success: false; error: string }>,
    options: {
      ephemeral?: boolean;
      isReply?: boolean;
    } = {}
  ): Promise<void> {
    const { ephemeral = true, isReply = true } = options;
    
    // Store the removed rules data for undo functionality (only successful ones)
    if (successful.length > 0) {
      const bulkRemovedData = {
        rules: successful.map(s => s.data),
        isBulk: true
      };
      this.removedRules.set(interaction.id, bulkRemovedData);
    }

    // Create success message
    let description = '';
    if (successful.length > 0) {
      const ruleList = successful.map(s => `Rule ${s.id}`).join(', ');
      description += `✅ **Successfully removed:** ${ruleList}\n\n`;
      
      // Add rule details
      successful.forEach(s => {
        description += `**Rule ${s.id}:** ${s.data.channel_name} → @${s.data.role_name}\n`;
      });
    }

    if (failed.length > 0) {
      description += '\n❌ **Failed to remove:**\n';
      failed.forEach(f => {
        description += `Rule ${f.id}: ${f.error}\n`;
      });
    }

    const embed = AdminFeedback.success(
      successful.length === 1 ? 'Rule Removed' : `${successful.length} Rules Removed`, 
      description.trim()
    );

    const components = [];
    if (successful.length > 0) {
      // Create Undo button for successful removals
      const undoButton = this.createUndoRemovalButton(interaction.id, 'removal');
      components.push(undoButton);
    }

    const messageContent = {
      embeds: [embed],
      components,
      ...(ephemeral && { ephemeral: true })
    };

    if (isReply) {
      await interaction.reply(messageContent);
    } else {
      await interaction.editReply(messageContent);
    }

    // Set up button interaction handler for undo removal (only if there are successful removals)
    if (successful.length > 0) {
      this.setupRemovalButtonHandler(interaction);
    }
  }

  /**
   * Sends feedback message for bulk rule restoration (undo removal)
   */
  private async sendBulkRuleRestoredMessage(
    interaction: any,
    restorationResults: Array<{
      success: boolean;
      rule?: any;
      ruleId?: number;
      error?: string;
      originalData?: any;
    }>
  ): Promise<void> {
    const successful = restorationResults.filter(r => r.success);
    const failed = restorationResults.filter(r => !r.success);
    
    // Store the restored rules data for potential undo functionality
    if (successful.length > 0) {
      const bulkRestoredData = {
        rules: successful.map(s => s.rule || s.originalData),
        isBulk: true
      };
      // Store in restoredRules for undo consistency, not confirmationData
      this.restoredRules.set(interaction.id, bulkRestoredData);
    }

    // Create success message
    let description = '';
    if (successful.length > 0) {
      const ruleList = successful.map(s => `Rule ${s.rule?.id || s.ruleId}`).join(', ');
      description += `✅ **Successfully restored:** ${ruleList}\n\n`;
      
      // Add rule details
      successful.forEach(s => {
        const rule = s.rule || s.originalData;
        description += `**Rule ${rule.id}:** ${rule.channel_name} → @${rule.role_name}\n`;
      });
    }

    if (failed.length > 0) {
      description += '\n❌ **Failed to restore:**\n';
      failed.forEach(f => {
        description += `Rule ${f.ruleId}: ${f.error}\n`;
      });
    }

    const embed = AdminFeedback.success(
      successful.length === 1 ? 'Rule Restored' : `${successful.length} Rules Restored`, 
      description.trim()
    );

    const components = [];
    if (successful.length > 0) {
      // Create Undo button for successful restorations (to remove them again)
      const undoButton = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`undo_restore_${interaction.id}`)
            .setLabel('Undo')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('↩️')
        );
      components.push(undoButton);
    }

    const messageContent = {
      embeds: [embed],
      components,
      ephemeral: true
    };

    await interaction.reply(messageContent);

    // Set up button interaction handler for undo (only if there are successful restorations)
    if (successful.length > 0) {
      this.setupRestoreButtonHandler(interaction);
    }
  }

  /**
   * Creates Undo action button for rule removal/cancellation messages
   */
  private createUndoRemovalButton(interactionId: string, type: 'removal' | 'cancellation') {
    return {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          custom_id: `undo_${type}_${interactionId}`,
          label: 'Undo',
          style: 2, // Secondary
          emoji: { name: '↩️' }
        }
      ]
    };
  }

  /**
   * Sets up button interaction handler for removal undo messages
   */
  private setupRemovalButtonHandler(interaction: ChatInputCommandInteraction | ButtonInteraction): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_removal_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_removal_')) {
        await this.handleUndoRemoval(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up removal data
        this.removedRules.delete(interaction.id);
      }
    });
  }

  /**
   * Sets up button interaction handler for removal undo messages with extended timeout
   * Used in undo chains where sessions need to last longer
   */
  private setupRemovalButtonHandlerWithExtendedTimeout(interaction: ChatInputCommandInteraction | ButtonInteraction): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_removal_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 600000, // 10 minutes (extended timeout for undo chains)
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_removal_')) {
        await this.handleUndoRemoval(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up removal data
        this.removedRules.delete(interaction.id);
      }
    });
  }

  /**
   * Handles Undo button interaction for rule removal - recreates the removed rule(s)
   */
  private async handleUndoRemoval(interaction: any): Promise<void> {
    const interactionId = interaction.customId.replace('undo_removal_', '');
    const removedRuleData = this.removedRules.get(interactionId);
    
    if (!removedRuleData) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Rule removal cannot be undone.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Check if this is a bulk operation
      if (removedRuleData.isBulk && removedRuleData.rules) {
        await this.handleBulkUndoRemoval(interaction, removedRuleData.rules);
      } else {
        // Single rule removal (existing logic)
        await this.handleSingleUndoRemoval(interaction, removedRuleData);
      }

      // Clean up the removal data
      this.removedRules.delete(interactionId);
    } catch (error) {
      Logger.error('Error undoing rule removal:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error restoring rule(s): ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Handles bulk undo removal for multiple rules
   */
  private async handleBulkUndoRemoval(interaction: any, removedRules: any[]): Promise<void> {
    const restorationResults = [];
    
    for (const removedRule of removedRules) {
      try {
        // Handle role recreation if needed
        let roleToUse = null;
        if (removedRule.wasNewlyCreated) {
          const existingRole = interaction.guild.roles.cache.get(removedRule.role_id);
          if (!existingRole) {
            // Recreate role
            const botMember = interaction.guild.members.me;
            let position = undefined;
            if (botMember) {
              const botHighestPosition = botMember.roles.highest.position;
              position = Math.max(1, botHighestPosition - 1);
            }

            roleToUse = await interaction.guild.roles.create({
              name: removedRule.role_name,
              color: 'Blue',
              position: position,
              reason: `Recreated for bulk rule restoration by ${interaction.user.tag}`
            });
            
            Logger.log(`Recreated role for bulk rule restoration: ${roleToUse.name} (${roleToUse.id})`);
            removedRule.role_id = roleToUse.id;
          }
        }
        
        // Recreate the rule
        const recreatedRule = await this.dbSvc.restoreRuleWithOriginalId(removedRule);
        restorationResults.push({ 
          success: true, 
          rule: recreatedRule, 
          originalData: { ...removedRule, wasNewlyCreated: removedRule.wasNewlyCreated } 
        });
      } catch (error) {
        restorationResults.push({ 
          success: false, 
          ruleId: removedRule.id, 
          error: error.message,
          originalData: removedRule
        });
      }
    }

    // Send bulk restoration message
    await this.sendBulkRuleRestoredMessage(interaction, restorationResults);
  }

  /**
   * Handles single undo removal (existing logic)
   */
  private async handleSingleUndoRemoval(interaction: any, removedRule: any): Promise<void> {
    let roleToUse = null;
    
    // If this rule had a newly created role, we need to recreate it first
    if (removedRule.wasNewlyCreated) {
      try {
        // Check if the role still exists (might have been recreated by another process)
        const existingRole = interaction.guild.roles.cache.get(removedRule.role_id);
        
        if (!existingRole) {
          // Role doesn't exist, recreate it
          // Get bot member to determine role position
          const botMember = interaction.guild.members.me;
          let position = undefined;
          
          if (botMember) {
            // Create role below bot's highest role
            const botHighestPosition = botMember.roles.highest.position;
            position = Math.max(1, botHighestPosition - 1);
          }

          roleToUse = await interaction.guild.roles.create({
            name: removedRule.role_name,
            color: 'Blue', // Default color (could be enhanced to store original color)
            position: position,
            reason: `Recreated for rule restoration by ${interaction.user.tag}`
          });
          
          Logger.log(`Recreated role for rule restoration: ${roleToUse.name} (${roleToUse.id})`);
          
          // Update the removed rule data with the new role ID
          removedRule.role_id = roleToUse.id;
        } else {
          // Role exists, use it
          roleToUse = existingRole;
          Logger.log(`Using existing role for rule restoration: ${existingRole.name} (${existingRole.id})`);
        }
      } catch (roleError) {
        Logger.error('Error recreating role for rule restoration:', roleError);
        // Continue with rule restoration even if role recreation fails
        // The role ID in the rule will still reference the original (now non-existent) role
      }
    }
    
    // Recreate the rule in the database with original ID
    const recreatedRule = await this.dbSvc.restoreRuleWithOriginalId(removedRule);
    
    // Store the restored rule for potential undo (preserve the wasNewlyCreated flag)
    const restoredRuleWithMetadata = {
      ...recreatedRule,
      wasNewlyCreated: removedRule.wasNewlyCreated
    };
    this.restoredRules.set(interaction.id, restoredRuleWithMetadata);
    
    // Create detailed rule info fields
    const ruleInfoFields = this.createRuleInfoFields(recreatedRule);
    const embedDescription = removedRule.wasNewlyCreated && roleToUse
      ? `Rule ${recreatedRule.id} for ${recreatedRule.channel_name} and @${recreatedRule.role_name} has been restored${!interaction.guild.roles.cache.has(removedRule.role_id) ? ' and the role has been recreated' : ''}.`
      : `Rule ${recreatedRule.id} for ${recreatedRule.channel_name} and @${recreatedRule.role_name} has been restored.`;
    
    const embed = AdminFeedback.success('Rule Restored', embedDescription);
    embed.addFields(ruleInfoFields);
    
    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`undo_restore_${interaction.id}`)
              .setLabel('Undo')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('↩️')
          )
      ],
      ephemeral: true
    });

    // Set up button handler for potential undo of restoration
    this.setupRestoreButtonHandler(interaction);
  }

  /**
   * Sets up button handler for rule restoration undo functionality
   */
  private setupRestoreButtonHandler(interaction: ChatInputCommandInteraction | ButtonInteraction): void {
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
      Logger.error('Error undoing rule restoration:', error);
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

    // Send bulk removal message
    await this.sendBulkRuleRemovedMessage(
      interaction,
      successful.map(s => ({ id: s.rule.id, data: s.rule, success: true })),
      removalResults.filter(r => !r.success).map(f => ({ id: f.ruleId, data: f.rule, success: false, error: f.error })),
      { ephemeral: true, isReply: true }
    );
  }

  /**
   * Handles single undo restore (existing logic)
   */
  private async handleSingleUndoRestore(interaction: any, restoredRule: any, interactionId: string): Promise<void> {
    // Remove the rule that was restored
    await this.dbSvc.deleteRoleMapping(String(restoredRule.id), restoredRule.server_id);
    
    // If this rule was restored with a newly created role, try to clean it up
    if (restoredRule.wasNewlyCreated) {
      await this.cleanupNewlyCreatedRole(interaction, restoredRule.role_id, restoredRule.server_id);
    }
    
    // Store the removed rule for potential undo (restore again), preserving metadata
    // Check if this came from a bulk operation by looking at the confirmation data
    const confirmationInfo = this.confirmationData.get(interactionId);
    const wasBulkOperation = confirmationInfo && confirmationInfo.isBulk;
    
    if (wasBulkOperation) {
      // Preserve bulk structure - convert single rule back to bulk format
      const bulkRemovedData = {
        rules: [{ ...restoredRule, wasNewlyCreated: restoredRule.wasNewlyCreated }],
        isBulk: true
      };
      this.removedRules.set(interaction.id, bulkRemovedData);
    } else {
      // Single rule operation
      const removedRuleWithMetadata = {
        ...restoredRule,
        wasNewlyCreated: restoredRule.wasNewlyCreated
      };
      this.removedRules.set(interaction.id, removedRuleWithMetadata);
    }
    
    // Create detailed rule info fields
    const ruleInfoFields = this.createRuleInfoFields(restoredRule);
    const embed = AdminFeedback.success('Rule Removed', `Rule ${restoredRule.id} for ${restoredRule.channel_name} and @${restoredRule.role_name} has been removed.`);
    embed.addFields(ruleInfoFields);
    
    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`undo_removal_${interaction.id}`)
              .setLabel('Undo')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('↩️')
          )
      ],
      ephemeral: true
    });

    // Set up button handler for potential undo of removal with extended timeout
    this.setupRemovalButtonHandlerWithExtendedTimeout(interaction);
  }

  /**
   * Creates Undo action button for rule confirmation messages
   */
  private createConfirmationButtons(interactionId: string) {
    return {
      type: 1, // ActionRow
      components: [
        {
          type: 2, // Button
          custom_id: `undo_rule_${interactionId}`,
          label: 'Undo',
          style: 4, // Danger
          emoji: { name: '↩️' }
        }
      ]
    };
  }

  /**
   * Sets up button interaction handler for confirmation messages
   */
  private setupConfirmationButtonHandler(interaction: ChatInputCommandInteraction): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_rule_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_rule_')) {
        await this.handleUndoRule(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up confirmation data
        this.confirmationData.delete(interaction.id);
      }
    });
  }

  /**
   * Handles Undo button interaction - removes the rule and shows removal message
   */
  private async handleUndoRule(interaction: any): Promise<void> {
    const interactionId = interaction.customId.replace('undo_rule_', '');
    const confirmationInfo = this.confirmationData.get(interactionId);
    
    if (!confirmationInfo) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Use `/setup remove-rule` if needed.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Get the rule data before deletion for potential future undo
      const allRules = await this.dbSvc.getRoleMappings(confirmationInfo.serverId);
      const ruleToRemove = allRules?.find(rule => rule.id === confirmationInfo.ruleId);
      
      if (ruleToRemove) {
        // Store for potential undo of this removal, including wasNewlyCreated flag
        const removedRuleWithMetadata = {
          ...ruleToRemove,
          wasNewlyCreated: confirmationInfo.wasNewlyCreated
        };
        this.removedRules.set(interaction.id, removedRuleWithMetadata);
      }

      // Delete the rule from the database
      await this.dbSvc.deleteRoleMapping(confirmationInfo.ruleId.toString(), confirmationInfo.serverId);
      
      // If this rule involved creating a new role, try to clean it up
      if (confirmationInfo.wasNewlyCreated && ruleToRemove) {
        await this.cleanupNewlyCreatedRole(interaction, ruleToRemove.role_id, confirmationInfo.serverId);
      }
      
      // Use the universal rule removed message method
      await this.sendRuleRemovedMessage(
        interaction,
        confirmationInfo.ruleId,
        ruleToRemove,
        { ephemeral: true, isReply: true }
      );

      // Clean up the confirmation data
      this.confirmationData.delete(interactionId);
    } catch (error) {
      Logger.error('Error undoing rule creation:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error undoing rule: ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Handles Undo button interaction for rule cancellation - creates the cancelled rule
   */
  private async handleUndoCancellation(interaction: any): Promise<void> {
    const interactionId = interaction.customId.replace('undo_cancellation_', '');
    const cancelledRule = this.cancelledRules.get(interactionId);
    
    if (!cancelledRule) {
      await interaction.reply({
        content: AdminFeedback.simple('Undo session expired. Rule cancellation cannot be undone.', true),
        ephemeral: true
      });
      return;
    }

    try {
      // Create the rule in the database
      const createdRule = await this.dbSvc.addRoleMapping(
        interaction.guild.id,
        interaction.guild.name,
        cancelledRule.channel.id,
        cancelledRule.channel.name,
        cancelledRule.slug,
        cancelledRule.role.id,
        cancelledRule.role.name,
        cancelledRule.attributeKey,
        cancelledRule.attributeValue,
        cancelledRule.minItems
      );
      
      // Store the created rule for potential undo
      this.confirmationData.set(interaction.id, {
        ruleId: createdRule.id,
        serverId: interaction.guild.id
      });
      
      // Create detailed rule info fields for the cancelled rule
      const cancelledRuleFormatted = {
        role_id: cancelledRule.role.id,
        role_name: cancelledRule.role.name,
        channel_name: cancelledRule.channel.name,
        slug: cancelledRule.slug,
        attribute_key: cancelledRule.attributeKey,
        attribute_value: cancelledRule.attributeValue,
        min_items: cancelledRule.minItems
      };
      const ruleInfoFields = this.createRuleInfoFields(cancelledRuleFormatted);
      const embed = AdminFeedback.success('Rule Added', `Rule ${createdRule.id} for ${cancelledRule.channel.name} and @${cancelledRule.role.name} has been added using existing verification message.`);
      embed.addFields(ruleInfoFields);
      
      // Create Undo button
      const undoButton = this.createConfirmationButtons(interaction.id);
      
      await interaction.reply({
        embeds: [embed],
        components: [undoButton],
        ephemeral: true
      });
      
      // Set up button interaction handler for potential undo of this creation
      this.setupConfirmationButtonHandler(interaction);

      // Clean up the cancellation data
      this.cancelledRules.delete(interactionId);
    } catch (error) {
      Logger.error('Error undoing rule cancellation:', error);
      await interaction.reply({
        content: AdminFeedback.simple(`Error creating rule: ${error.message}`, true),
        ephemeral: true
      });
    }
  }

  /**
   * Sets up button interaction handler for cancellation undo messages
   */
  private setupCancellationButtonHandler(interaction: ChatInputCommandInteraction): void {
    const filter = (i: any) => 
      i.customId.startsWith('undo_cancellation_') && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 300000, // 5 minutes
      componentType: ComponentType.Button
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('undo_cancellation_')) {
        await this.handleUndoCancellation(i);
      }
      collector.stop();
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up cancellation data
        this.cancelledRules.delete(interaction.id);
      }
    });
  }

  /**
   * Creates detailed rule information fields for consistent display across all rule messages
   */
  private createRuleInfoFields(rule: any): Array<{name: string, value: string, inline: boolean}> {
    const collection = rule.slug || 'ALL';
    const attribute = rule.attribute_key === 'ALL' && rule.attribute_value === 'ALL' 
      ? 'ALL' 
      : `${rule.attribute_key}=${rule.attribute_value}`;
    const minItems = rule.min_items?.toString() || '1';

    return [
      { name: 'Collection', value: collection, inline: true },
      { name: 'Attribute', value: attribute, inline: true },
      { name: 'Min Items', value: minItems, inline: true }
    ];
  }

  private async showDuplicateRoleWarning(
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
      'Duplicate Role Assignment',
      'This role already has a verification rule with different criteria. Users meeting the new criteria will also receive this role. This might be intentional (multiple ways to earn same role) or an error.',
      [
        'Click "Create Anyway" to add another way to earn this role',
        'Click "Cancel" to modify your role or criteria'
      ],
      [
        {
          name: 'Existing Rule',
          value: AdminFeedback.formatRule(existingRuleFormatted, newRuleData.role.name),
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
          .setCustomId(`confirm_duplicate_role_${interaction.id}`)
          .setLabel('Create Anyway')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`cancel_duplicate_role_${interaction.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('❌')
      );

    await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

    // Store pending rule for confirmation
    this.pendingRules.set(interaction.id, newRuleData);

    // Set up button handler
    this.setupDuplicateRoleButtonHandler(interaction);
  }

  private setupDuplicateRoleButtonHandler(interaction: ChatInputCommandInteraction): void {
    const filter = (i: any) => 
      (i.customId.startsWith('confirm_duplicate_role_') || i.customId.startsWith('cancel_duplicate_role_')) && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 60000 // 1 minute
    });

    collector?.on('collect', async (i) => {
      if (i.customId.startsWith('confirm_duplicate_role_')) {
        await i.deferUpdate();
        await this.createRuleDirectly(interaction, this.pendingRules.get(interaction.id), true);
        this.pendingRules.delete(interaction.id);
      } else if (i.customId.startsWith('cancel_duplicate_role_')) {
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

  /**
   * Attempts to clean up a newly created role if it's no longer being used
   * Only deletes the role if no other rules are using it
   */
  private async cleanupNewlyCreatedRole(interaction: any, roleId: string, serverId: string): Promise<void> {
    try {
      // Check if any other rules are using this role
      const allRules = await this.dbSvc.getRoleMappings(serverId);
      const rulesUsingRole = allRules?.filter(rule => rule.role_id === roleId) || [];
      
      // If no other rules use this role, delete it
      if (rulesUsingRole.length === 0) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && role.editable) {
          await role.delete('Cleaning up unused role after rule undo');
          Logger.log(`Cleaned up newly created role: ${role.name} (${roleId})`);
        }
      }
    } catch (error) {
      // Don't fail the undo operation if role cleanup fails
      Logger.warn(`Failed to cleanup role ${roleId}:`, error);
    }
  }
}
