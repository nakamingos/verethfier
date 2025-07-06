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
 * - List and display current verification rules
 * - Manage legacy rule migration and cleanup
 * - Create and update verification messages in channels
 * - Provide rich admin feedback with embedded messages
 * 
 * Command flows include:
 * - Rule creation with duplicate detection and confirmation
 * - Role management (find existing or create new roles)
 * - Channel validation and message posting
 * - Legacy system migration assistance
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

      // Check if there are legacy roles that need to be migrated
      const legacyRolesResult = await this.dbSvc.getLegacyRoles(interaction.guild.id);
      const legacyRoles = legacyRolesResult.data;
      
      if (legacyRoles && legacyRoles.length > 0) {
        await interaction.editReply({
          embeds: [AdminFeedback.error(
            'Legacy Rules Exist',
            'You must migrate or remove the legacy rule(s) for this server before adding new rules.',
            [
              'Use `/setup migrate-legacy-rule` to migrate legacy rules',
              'Use `/setup remove-legacy-rule` to remove legacy rules'
            ]
          )]
        });
        return;
      }

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
        return;
      }

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
          return;
        }
        // Role exists and is manageable - we'll use it
      }

      // If role doesn't exist, create it
      if (!role) {
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
          return;
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
        } catch (error) {
          await interaction.editReply({
            embeds: [AdminFeedback.error(
              'Role Creation Failed',
              `Failed to create role "${roleName}": ${error.message}`,
              ['Try again with a different role name']
            )]
          });
          return;
        }
      }

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
        return;
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
        return;
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
      // Find existing verification message ID from existing rules
      const existingMessageId = existingRules.find(rule => rule.message_id)?.message_id;
      
      if (existingMessageId) {
        // Update the new rule with the existing message_id
        await this.dbSvc.updateRuleMessageId(newRule.id, existingMessageId);
      }

      // Use existing verification message
      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> added using existing verification message.`,
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
      
      const messageId = await this.messageSvc.createVerificationMessage(channel as GuildTextBasedChannel);
      
      // Wait for DB update to complete before replying
      await this.dbSvc.updateRuleMessageId(newRule.id, messageId);
      
      // Optionally, add a short delay to ensure DB consistency
      await new Promise(res => setTimeout(res, 100));

      const formatAttribute = (key: string, value: string) => {
        if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
        if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
        if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
        return 'ALL';
      };

      const embed = AdminFeedback.success(
        isDuplicateConfirmed ? 'Duplicate Rule Created' : 'Rule Added',
        `Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> added with new verification message.`,
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
    
    const rules = await this.dbSvc.getAllRulesWithLegacy(
      interaction.guild.id
    );
    
    let desc = rules.length
      ? rules.map(r =>
          r.legacy
            ? `[LEGACY] Rule: <@&${r.role_id}> (from legacy setup, please migrate or remove)`
            : `ID: ${r.id} | Channel: <#${r.channel_id}> | Role: <@&${r.role_id}> | Slug: ${r.slug || 'ALL'} | Attr: ${r.attribute_key && r.attribute_key !== 'ALL' ? (r.attribute_value && r.attribute_value !== 'ALL' ? `${r.attribute_key}=${r.attribute_value}` : `${r.attribute_key} (any value)`) : (r.attribute_value && r.attribute_value !== 'ALL' ? `ALL=${r.attribute_value}` : 'ALL')} | Min: ${r.min_items || 1}`
        ).join('\n')
      : 'No rules found.';
      
    if (rules.some(r => r.legacy)) {
      desc +=
        '\n\n⚠️ [LEGACY] rules are from the old setup and may assign outdated roles. Please migrate to the new rules system and remove legacy rules.';
    }
    
    await interaction.editReply({
      embeds: [AdminFeedback.info('Verification Rules', desc)]
    });
  }

  async handleRemoveLegacyRule(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const legacyRolesResult = await this.dbSvc.getLegacyRoles(interaction.guild.id);
    const legacyRoles = legacyRolesResult.data;
    
    if (!legacyRoles || legacyRoles.length === 0) {
      await interaction.editReply({
        content: AdminFeedback.simple('No legacy roles found for this server. Nothing to remove.')
      });
      return;
    }
    
    await this.dbSvc.removeAllLegacyRoles(interaction.guild.id);
    
    await interaction.editReply({
      content: AdminFeedback.simple(`Removed ${legacyRoles.length} legacy rule(s).`)
    });
  }

  async handleMigrateLegacyRule(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.options.getChannel('channel');
    if (!channel) {
      await interaction.reply({
        content: AdminFeedback.simple('Channel not found or not specified.', true),
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Get legacy roles
    const legacyRolesResult = await this.dbSvc.getLegacyRoles(interaction.guild.id);
    const legacyRoles = legacyRolesResult.data;
    
    if (!legacyRoles || legacyRoles.length === 0) {
      await interaction.editReply({
        content: AdminFeedback.simple('No legacy roles found for this server. Nothing to migrate.')
      });
      return;
    }
    
    // For each legacy role, create a new rule in verifier_rules
    const created = [];
    const alreadyPresent = [];
    
    for (const legacy of legacyRoles) {
      const exists = await this.dbSvc.ruleExists(
        interaction.guild.id,
        channel.id,
        legacy.role_id,
        'ALL'
      );
      
      if (exists) {
        alreadyPresent.push(`<@&${legacy.role_id}>`);
        continue;
      }
      
      try {
        await this.dbSvc.addRoleMapping(
          interaction.guild.id,
          interaction.guild.name,
          channel.id,
          channel.name,
          'ALL', // slug
          legacy.role_id,
          legacy.name || 'Legacy Role', // role_name
          null, // attribute_key
          null, // attribute_value
          1    // min_items (set to 1 for migration)
        );
        created.push(`<@&${legacy.role_id}>`);
      } catch (e) {
        // Optionally handle per-role errors
        Logger.error(`Error migrating role ${legacy.role_id}:`, e);
      }
    }
    
    await this.dbSvc.removeAllLegacyRoles(interaction.guild.id);
    
    let msg = '';
    if (created.length) msg += `Migrated legacy rule(s) to new rule(s) for channel <#${channel.id}>: ${created.join(', ')}. `;
    if (alreadyPresent.length) msg += `Legacy rule(s) already exist as new rule(s) for channel <#${channel.id}>: ${alreadyPresent.join(', ')}. `;
    msg += 'Removed legacy rule(s).';
    
    await interaction.editReply({
      content: msg
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

      // Find orphaned rules for this channel (rules pointing to non-existent messages)
      const channelRules = await this.dbSvc.getRulesByChannel(interaction.guild.id, channel.id);
      const orphanedRules = [];

      for (const rule of channelRules) {
        if (rule.message_id) {
          const messageExists = await this.messageSvc.verifyMessageExists(textChannel, rule.message_id);
          if (!messageExists) {
            orphanedRules.push(rule);
          }
        }
      }

      if (orphanedRules.length === 0) {
        await interaction.editReply({
          content: AdminFeedback.simple('No orphaned verification rules found for this channel. All existing verification messages appear to be intact.')
        });
        return;
      }

      // Create a new verification message
      const newMessageId = await this.messageSvc.createVerificationMessage(textChannel);

      // Update all orphaned rules to point to the new message
      let updatedCount = 0;
      for (const rule of orphanedRules) {
        try {
          await this.dbSvc.updateRuleMessageId(rule.id, newMessageId);
          updatedCount++;
        } catch (error) {
          Logger.error(`Failed to update rule ${rule.id}:`, error);
        }
      }

      // Provide feedback to the admin
      const embed = AdminFeedback.success(
        'Verification Recovery Complete',
        `Successfully recovered verification setup for ${textChannel}`,
        [
          { name: 'New Message Created', value: `Message ID: ${newMessageId}`, inline: false },
          { name: 'Rules Updated', value: `${updatedCount}/${orphanedRules.length} rules updated`, inline: true },
          { name: 'Roles Affected', value: orphanedRules.map(r => `<@&${r.role_id}>`).join(', ') || 'None', inline: false }
        ]
      );
      
      embed.setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

      Logger.debug(`Recovery completed for channel ${channel.id}: ${updatedCount} rules updated, new message ${newMessageId}`);

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
}
