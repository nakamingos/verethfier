import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { 
  ChatInputCommandInteraction, 
  TextChannel, 
  Role, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ComponentType,
  ButtonInteraction,
  ChannelType,
  GuildTextBasedChannel
} from 'discord.js';
import { DbService } from '../../db.service';
import { DiscordMessageService } from '../../discord-message.service';
import { DiscordService } from '../../discord.service';
import { DataService } from '../../data.service';
import { AdminFeedback } from '../../utils/admin-feedback.util';
import { RuleConfirmationInteractionHandler } from '../interactions/rule-confirmation.interaction';
import { DuplicateRuleConfirmationInteractionHandler } from '../interactions/duplicate-rule-confirmation.interaction';

/**
 * Add Rule Command Handler
 * 
 * Handles the complete flow for adding verification rules:
 * - Input validation
 * - Role creation/finding
 * - Duplicate detection and warnings
 * - Rule creation with confirmation
 * - Integration with verification messages
 */
@Injectable()
export class AddRuleHandler {
  private readonly logger = new Logger(AddRuleHandler.name);
  
  // Store pending rules for confirmation flow
  private pendingRules: Map<string, any> = new Map();

  constructor(
    private readonly dbSvc: DbService,
    private readonly messageSvc: DiscordMessageService,
    @Inject(forwardRef(() => DiscordService))
    private readonly discordSvc: DiscordService,
    private readonly dataSvc: DataService,
    private readonly ruleConfirmationHandler: RuleConfirmationInteractionHandler,
    private readonly duplicateRuleConfirmationHandler: DuplicateRuleConfirmationInteractionHandler
  ) {}

  /**
   * Main entry point for add rule command
   */
  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
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
      this.logger.error('Error in handleAddRule:', error);
      if (interaction.deferred) {
        await interaction.editReply('An error occurred while adding the rule.');
      } else {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ 
          content: AdminFeedback.simple('An error occurred while adding the rule.', true)
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

    // Validate slug exists in marketplace database (unless it's ALL)
    if (slug !== 'ALL') {
      try {
        const availableSlugs = await this.dataSvc.getAllSlugs();
        if (!availableSlugs.includes(slug)) {
          await interaction.editReply({
            embeds: [AdminFeedback.error(
              'Invalid Slug',
              `The slug "${slug}" does not exist in the marketplace database.`,
              [
                'Use the autocomplete feature to select a valid slug',
                'Leave the slug field empty to allow ALL collections'
              ]
            )]
          });
          return null;
        }
      } catch (error) {
        this.logger.error('Error validating slug:', error);
        await interaction.editReply({
          content: AdminFeedback.simple('Error validating slug. Please try again.', true)
        });
        return null;
      }
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
    const existingRoleRule = await this.dbSvc.checkForDuplicateRule(
      interaction.guild.id,
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
   * Shows duplicate rule warning and handles user confirmation
   */
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

    // Generate a chain ID for this undo/redo chain
    const chainId = this.generateChainId(interaction);

    // Use the interaction handler for button management
    const buttonRow = this.duplicateRuleConfirmationHandler.createDuplicateRuleButtons(chainId);

    await interaction.editReply({
      embeds: [embed],
      components: [buttonRow]
    });

    // Store the new rule data for later use if confirmed
    this.duplicateRuleConfirmationHandler.storeRuleData(chainId, {
      ...newRuleData,
      serverId: interaction.guild.id
    });

    // Set up button interaction handler with proper undo chain integration
    this.duplicateRuleConfirmationHandler.setupDuplicateRuleButtonHandler(
      interaction,
      chainId,
      async (ruleData: any) => {
        // Create Anyway - proceed with rule creation and set up undo chain
        await this.createRuleDirectly(interaction, ruleData, true, chainId);
      },
      async (ruleData: any) => {
        // Cancel - show cancellation message with undo button
        await this.showRuleCancellationMessage(interaction, ruleData, chainId);
      }
    );
  }

  /**
   * Shows duplicate role warning (same role, different criteria)
   */
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
    const newRuleFormatted = {
      role_id: newRuleData.role.id,
      slug: newRuleData.slug,
      attribute_key: newRuleData.attributeKey,
      attribute_value: newRuleData.attributeValue,
      min_items: newRuleData.minItems
    };

    const embed = AdminFeedback.warning(
      'Role Already Has Rules',
      `The role <@&${newRuleData.role.id}> already has verification rules in this channel. Adding another rule will create multiple ways to earn the same role.`,
      [
        'Click "Create Anyway" to add another way to earn this role',
        'Click "Cancel" to modify your criteria'
      ],
      [
        {
          name: 'Existing Rule',
          value: AdminFeedback.formatRule(existingRule),
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

    // Store the new rule data for later use if confirmed
    this.pendingRules.set(`confirm_duplicate_role_${interaction.id}`, {
      interaction,
      newRuleData,
      isDuplicateRole: true
    });

    // Set up button collector to handle Create Anyway/Cancel buttons
    this.setupDuplicateRoleButtonHandler(interaction, newRuleData);
  }

  /**
   * Sets up button collector for duplicate role confirmation
   */
  private setupDuplicateRoleButtonHandler(
    interaction: ChatInputCommandInteraction,
    newRuleData: {
      channel: TextChannel;
      role: Role;
      slug: string;
      attributeKey: string;
      attributeValue: string;
      minItems: number;
    }
  ): void {
    const filter = (i: any) => 
      (i.customId.startsWith('confirm_duplicate_role_') || i.customId.startsWith('cancel_duplicate_role_')) && 
      i.customId.endsWith(`_${interaction.id}`) && 
      i.user.id === interaction.user.id;
    
    const collector = interaction.channel?.createMessageComponentCollector({ 
      filter, 
      time: 60000 // 1 minute
    });

    collector?.on('collect', async (i) => {
      try {
        if (i.customId.startsWith('confirm_duplicate_role_')) {
          await i.deferUpdate();
          // Create the rule anyway
          await this.createRuleDirectly(interaction, newRuleData, true);
          this.pendingRules.delete(`confirm_duplicate_role_${interaction.id}`);
        } else if (i.customId.startsWith('cancel_duplicate_role_')) {
          await i.deferUpdate();
          await interaction.editReply({
            embeds: [AdminFeedback.info('Rule Creation Cancelled', 'The rule was not created.')],
            components: []
          });
          this.pendingRules.delete(`confirm_duplicate_role_${interaction.id}`);
        }
      } catch (error) {
        this.logger.error('Error handling duplicate role button interaction:', error);
        await interaction.editReply({
          embeds: [AdminFeedback.error('Error', 'An error occurred while processing your request.')],
          components: []
        });
      } finally {
        collector.stop();
      }
    });

    collector?.on('end', (collected) => {
      if (collected.size === 0) {
        // Timeout - clean up
        this.pendingRules.delete(`confirm_duplicate_role_${interaction.id}`);
        interaction.editReply({
          embeds: [AdminFeedback.warning('Timeout', 'No response received. Rule creation cancelled.')],
          components: []
        }).catch(error => {
          this.logger.error('Error updating interaction after timeout:', error);
        });
      }
    });
  }

  /**
   * Creates the rule directly without further confirmation
   */
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
    isDuplicateConfirmed: boolean = false,
    chainId?: string
  ): Promise<void> {
    const { channel, role, slug, attributeKey, attributeValue, minItems, wasNewlyCreated = false } = ruleData;

    // Check for existing verification setup
    const existingRules = await this.dbSvc.getRulesByChannel(interaction.guild.id, channel.id) || [];
    
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
      this.logger.error('Error creating rule:', error);
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

    if (existingRules.length > 0) {
      // Check if there's already a verification message from our bot in this channel
      const hasExistingMessage = await this.messageSvc.findExistingVerificationMessage(channel);

      // Use existing verification message
      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> ${hasExistingMessage ? 'has been added using existing verification message' : 'created'}.`
      );

      // Add detailed rule info fields
      const ruleInfoFields = this.duplicateRuleConfirmationHandler.createRuleInfoFields({
        rule_id: newRule.id,
        role_id: role.id,
        role_name: role.name,
        channel_name: channel.name,
        slug: slug,
        attribute_key: attributeKey,
        attribute_value: attributeValue,
        min_items: minItems
      });
      embed.addFields(ruleInfoFields);

      if (isDuplicateConfirmed) {
        embed.addFields({
          name: '⚠️ Note',
          value: 'This rule has the same criteria as an existing rule. Users meeting these criteria will receive multiple roles.',
          inline: false
        });
      }

      // Store confirmation data for Undo functionality
      const confirmationId = chainId || interaction.id;
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
      this.ruleConfirmationHandler.storeConfirmationData(confirmationId, confirmationInfo);

      // Create Undo button
      const actionButtons = this.ruleConfirmationHandler.createConfirmationButtons(confirmationId);

      await interaction.editReply({ 
        embeds: [embed], 
        components: [actionButtons]
      });

      // Set up button interaction handler with timeout
      this.ruleConfirmationHandler.setupConfirmationButtonHandler(interaction);
    } else {
      // Create new verification message
      await this.createNewVerificationSetup(interaction, channel, role, slug, attributeKey, attributeValue, minItems, isDuplicateConfirmed, newRule, wasNewlyCreated, chainId);
    }
  }

  /**
   * Creates new verification setup for the first rule in a channel
   */
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
    wasNewlyCreated: boolean = false,
    chainId?: string
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

      const formatAttribute = (key: string, value: string) => {
        if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
        if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
        if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
        return 'ALL';
      };

      // Create success embed
      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Verification Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> has been ${messageCreated ? 'created with a new verification message' : 'added to existing verification message'}.`
      );

      // Add detailed rule info fields
      const ruleInfoFields = this.duplicateRuleConfirmationHandler.createRuleInfoFields({
        rule_id: newRule.id,
        role_id: role.id,
        role_name: role.name,
        channel_name: channel.name,
        slug: slug,
        attribute_key: attributeKey,
        attribute_value: attributeValue,
        min_items: minItems
      });
      embed.addFields(ruleInfoFields);

      if (isDuplicateConfirmed) {
        embed.addFields({
          name: '⚠️ Note',
          value: 'This rule has the same criteria as an existing rule. Users meeting these criteria will receive multiple roles.',
          inline: false
        });
      }

      if (wasNewlyCreated) {
        embed.addFields({
          name: '🆕 New Role Created',
          value: `The role <@&${role.id}> was created for this verification rule.`,
          inline: false
        });
      }

      // Store confirmation data for Undo functionality
      const confirmationId = chainId || interaction.id;
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
      this.ruleConfirmationHandler.storeConfirmationData(confirmationId, confirmationInfo);

      // Create Undo button
      const actionButtons = this.ruleConfirmationHandler.createConfirmationButtons(confirmationId);

      await interaction.editReply({ 
        embeds: [embed], 
        components: [actionButtons]
      });

      // Set up button interaction handler with timeout
      this.ruleConfirmationHandler.setupConfirmationButtonHandler(interaction);

    } catch (error) {
      this.logger.error('Error creating new verification setup:', error);
      await interaction.editReply({
        embeds: [AdminFeedback.error(
          'Setup Failed', 
          'Failed to set up verification. The rule was created but verification message setup failed.',
          ['The rule exists in the database', 'Try running the recover-verification command']
        )],
        components: []
      });
    }
  }

  /**
   * Shows rule cancellation message with undo functionality
   */
  private async showRuleCancellationMessage(
    interaction: ChatInputCommandInteraction,
    ruleData: any,
    chainId: string
  ): Promise<void> {
    const embed = AdminFeedback.success(
      'Rule Creation Cancelled',
      'The rule creation has been cancelled. You can undo this action if it was a mistake.'
    );

    // Create undo button
    const undoButton = this.duplicateRuleConfirmationHandler.createUndoRemovalButton(chainId, 'cancellation');

    await interaction.editReply({
      embeds: [embed],
      components: [undoButton]
    });

    // Set up undo functionality
    this.duplicateRuleConfirmationHandler.setupCancellationButtonHandler(
      interaction,
      chainId,
      async (undoRuleData: any) => {
        // Undo cancellation - recreate the duplicate warning
        await this.recreateDuplicateWarning(interaction, undoRuleData);
      }
    );
  }

  /**
   * Recreates the duplicate warning after undoing cancellation
   */
  private async recreateDuplicateWarning(
    interaction: ChatInputCommandInteraction,
    ruleData: any
  ): Promise<void> {
    // Re-check for duplicate rules and show the warning again
    const existingRule = await this.dbSvc.checkForDuplicateRule(
      interaction.guild.id,
      ruleData.channel.id,
      ruleData.slug,
      ruleData.attributeKey,
      ruleData.attributeValue,
      ruleData.minItems,
      ruleData.role.id // Exclude the same role
    );

    if (existingRule) {
      await this.showDuplicateRuleWarning(interaction, existingRule, ruleData);
    } else {
      // No duplicate found anymore, proceed with rule creation
      await this.createRuleDirectly(interaction, ruleData, false);
    }
  }

  /**
   * Generates a consistent chain ID for undo/redo functionality
   */
  private generateChainId(interaction: ChatInputCommandInteraction): string {
    return `${interaction.user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
