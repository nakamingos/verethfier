import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ChannelType, GuildTextBasedChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, Role } from 'discord.js';
import { DbService } from './db.service';
import { DiscordMessageService } from './discord-message.service';
import { DiscordService } from './discord.service';

@Injectable()
export class DiscordCommandsService {
  // Store pending rules for confirmation flow
  private pendingRules: Map<string, any> = new Map();

  /**
   * Initialize the service with the Discord client.
   * This service doesn't directly use the client but maintains consistency.
   */
  initialize(client: any): void {
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
          content: 'You must migrate or remove the legacy rule(s) for this server before adding new rules. Use /setup migrate-legacy-rule or /setup remove-legacy-rule.'
        });
        return;
      }

      const channel = interaction.options.getChannel('channel') as TextChannel;
      const role = interaction.options.getRole('role') as Role;
      const slug = interaction.options.getString('slug') || 'ALL';
      const attributeKey = interaction.options.getString('attribute_key') || 'ALL';
      const attributeValue = interaction.options.getString('attribute_value') || 'ALL';
      const minItems = interaction.options.getInteger('min_items') || 1;

      if (!channel || !role) {
        await interaction.editReply('Channel and role are required.');
        return;
      }

      // Check for duplicate rules first
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
        await interaction.reply({ content: 'An error occurred while adding the rule.', ephemeral: true });
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
    
    // Format attribute display for both rules
    const formatAttribute = (key: string, value: string) => {
      if (key !== 'ALL' && value !== 'ALL') return `${key}=${value}`;
      if (key !== 'ALL' && value === 'ALL') return `${key} (any value)`;
      if (key === 'ALL' && value !== 'ALL') return `ALL=${value}`;
      return 'ALL';
    };

    const existingAttr = formatAttribute(existingRule.attribute_key, existingRule.attribute_value);
    const newAttr = formatAttribute(newRuleData.attributeKey, newRuleData.attributeValue);

    const embed = new EmbedBuilder()
      .setColor(0xFFAA00) // Orange for warning
      .setTitle('⚠️ Duplicate Rule Detected')
      .setDescription('A rule with the same criteria already exists for a different role.')
      .addFields(
        {
          name: '📋 Existing Rule',
          value: `**Role:** ${existingRole?.name || 'Unknown Role'}\n**Collection:** ${existingRule.slug}\n**Attribute:** ${existingAttr}\n**Min Items:** ${existingRule.min_items}`,
          inline: true
        },
        {
          name: '🆕 New Rule (Proposed)',
          value: `**Role:** ${newRuleData.role.name}\n**Collection:** ${newRuleData.slug}\n**Attribute:** ${newAttr}\n**Min Items:** ${newRuleData.minItems}`,
          inline: true
        },
        {
          name: '❓ What happens if you proceed?',
          value: 'Users meeting these criteria will receive **both roles**. This might be intentional (role stacking) or an error.',
          inline: false
        }
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
          embeds: [
            new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('❌ Rule Creation Cancelled')
              .setDescription('The rule was not created.')
          ],
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
          embeds: [
            new EmbedBuilder()
              .setColor(0x808080)
              .setTitle('⏰ Request Timed Out')
              .setDescription('Rule creation was cancelled due to timeout.')
          ],
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
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error Creating Rule')
            .setDescription('Failed to create the rule. Please try again.')
        ],
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
      // Use existing verification message
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(isDuplicateConfirmed ? '✅ Duplicate Rule Created' : '✅ Rule Added')
        .setDescription(`Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> added using existing verification message.`)
        .addFields(
          { name: 'Collection', value: slug, inline: true },
          { name: 'Attribute', value: formatAttribute(attributeKey, attributeValue), inline: true },
          { name: 'Min Items', value: minItems.toString(), inline: true }
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
          content: 'Selected channel is not a text or announcement channel.',
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

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle(isDuplicateConfirmed ? '✅ Duplicate Rule Created' : '✅ Rule Added')
        .setDescription(`Rule ${newRule.id} for <#${channel.id}> and <@&${role.id}> added with new verification message.`)
        .addFields(
          { name: 'Collection', value: slug, inline: true },
          { name: 'Attribute', value: formatAttribute(attributeKey, attributeValue), inline: true },
          { name: 'Min Items', value: minItems.toString(), inline: true }
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
        content: 'Failed to send Verify Now message. Please check my permissions and try again.',
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
        embeds: [
          new EmbedBuilder()
            .setTitle('Rule Removed')
            .setDescription(`Rule ID ${ruleId} removed.`)
            .setColor('#FF0000')
        ]
      });
    } catch (err) {
      await interaction.editReply({
        content: `Error: ${err.message}`
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
      embeds: [
        new EmbedBuilder()
          .setTitle('Verification Rules')
          .setDescription(desc)
          .setColor('#C3FF00')
      ]
    });
  }

  async handleRemoveLegacyRule(interaction: ChatInputCommandInteraction): Promise<void> {
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const legacyRolesResult = await this.dbSvc.getLegacyRoles(interaction.guild.id);
    const legacyRoles = legacyRolesResult.data;
    
    if (!legacyRoles || legacyRoles.length === 0) {
      await interaction.editReply({
        content: 'No legacy roles found for this server. Nothing to remove.'
      });
      return;
    }
    
    await this.dbSvc.removeAllLegacyRoles(interaction.guild.id);
    
    await interaction.editReply({
      content: `Removed ${legacyRoles.length} legacy rule(s).`
    });
  }

  async handleMigrateLegacyRule(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.options.getChannel('channel');
    if (!channel) {
      await interaction.reply({
        content: 'Channel not found or not specified.',
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
        content: 'No legacy roles found for this server. Nothing to migrate.'
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
          content: 'Please specify a valid text channel.'
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
          content: 'No orphaned verification rules found for this channel. All existing verification messages appear to be intact.'
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
      const embed = new EmbedBuilder()
        .setTitle('Verification Recovery Complete')
        .setDescription(`Successfully recovered verification setup for ${textChannel}`)
        .addFields(
          { name: 'New Message Created', value: `Message ID: ${newMessageId}`, inline: false },
          { name: 'Rules Updated', value: `${updatedCount}/${orphanedRules.length} rules updated`, inline: true },
          { name: 'Roles Affected', value: orphanedRules.map(r => `<@&${r.role_id}>`).join(', ') || 'None', inline: false }
        )
        .setColor('#00FF00')
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });

      Logger.debug(`Recovery completed for channel ${channel.id}: ${updatedCount} rules updated, new message ${newMessageId}`);

    } catch (error) {
      Logger.error('Error in handleRecoverVerification:', error);
      
      if (interaction.deferred) {
        await interaction.editReply({
          content: `Error during recovery: ${error.message}`
        });
      } else {
        await interaction.reply({
          content: `Error during recovery: ${error.message}`,
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
}
