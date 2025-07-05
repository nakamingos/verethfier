import { Injectable, Logger } from '@nestjs/common';
import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, ChannelType, GuildTextBasedChannel } from 'discord.js';
import { DbService } from './db.service';
import { DiscordMessageService } from './discord-message.service';

@Injectable()
export class DiscordCommandsService {
  /**
   * Initialize the service with the Discord client.
   * This service doesn't directly use the client but maintains consistency.
   */
  initialize(client: any): void {
    // No client needed for this service
  }

  constructor(
    private readonly dbSvc: DbService,
    private readonly messageSvc: DiscordMessageService
  ) {}

  async handleAddRule(interaction: ChatInputCommandInteraction): Promise<void> {
    // Check if there are legacy roles that need to be migrated
    const legacyRolesResult = await this.dbSvc.getLegacyRoles(interaction.guild.id);
    const legacyRoles = legacyRolesResult.data;
    
    if (legacyRoles && legacyRoles.length > 0) {
      await interaction.reply({
        content: 'You must migrate or remove the legacy rule(s) for this server before adding new rules. Use /setup migrate-legacy-rule or /setup remove-legacy-rule.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const channel = interaction.options.getChannel('channel');
    if (!channel) {
      await interaction.reply({
        content: 'Channel not found or not specified.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const role = interaction.options.getRole('role');
    if (!role) {
      await interaction.reply({
        content: 'Role not found or not specified.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const slug = interaction.options.getString('slug') || null;
    const attrKey = interaction.options.getString('attribute_key') || null;
    const attrVal = interaction.options.getString('attribute_value') || null;
    const minItems = interaction.options.getInteger('min_items') || 1;
    
    // Defer the reply early to prevent timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Debug logging to help troubleshoot rule creation
    Logger.debug('Creating rule with parameters:', {
      serverId: interaction.guild.id,
      serverName: interaction.guild.name,
      channelId: channel.id,
      channelName: channel.name,
      slug,
      roleId: role.id,
      attrKey,
      attrVal,
      minItems
    });
    
    // Check for existing rule with the same criteria before attempting to create
    let finalSlug = slug;
    if (!slug && !attrKey && !attrVal && !minItems) {
      finalSlug = 'ALL';
    }
    
    try {
      const existingRule = await this.dbSvc.findConflictingRule(
        interaction.guild.id,
        channel.id,
        role.id,
        finalSlug,
        attrKey,
        attrVal,
        minItems
      );
      
      if (existingRule) {
        Logger.debug('Found conflicting rule:', existingRule);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Rule Already Exists')
              .setDescription(`A rule with the same criteria already exists for <#${channel.id}> and <@&${role.id}>.\n\n**Existing Rule:**\n- Slug: ${existingRule.slug || 'None'}\n- Attribute: ${existingRule.attribute_key ? `${existingRule.attribute_key}=${existingRule.attribute_value}` : 'None'}\n- Min Items: ${existingRule.min_items || 'None'}\n\nUse \`/setup list-rules\` to see all existing rules.`)
              .setColor('#FF9900') // Orange color for warning
          ]
        });
        return;
      }
    } catch (error) {
      Logger.debug('Error checking for conflicting rule (this is normal if no conflict):', error);
    }
    
    let rule;
    try {
      rule = await this.dbSvc.addRoleMapping(
        interaction.guild.id,
        interaction.guild.name,
        channel.id,
        channel.name,
        slug,
        role.id,
        attrKey,
        attrVal,
        minItems
      );
    } catch (error) {
      Logger.error('Error creating rule:', error);
      
      // Check for duplicate rule error (Supabase/PostgreSQL constraint violation)
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('already exists')) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Rule Already Exists')
              .setDescription(`A rule with the same criteria already exists for <#${channel.id}> and <@&${role.id}>. Use \`/setup list-rules\` to see existing rules.`)
              .setColor('#FF9900') // Orange color for warning
          ]
        });
        return;
      }
      
      // Generic error for other database issues
      await interaction.editReply({
        content: 'Failed to create rule. Please check your parameters and try again.'
      });
      return;
    }
    
    Logger.debug('addRoleMapping result:', rule);
    const newRule = rule;
    
    // Check for existing Wallet Verification message in the Discord channel
    let existingVerificationMessageId = null;
    try {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
        existingVerificationMessageId = await this.messageSvc.findExistingVerificationMessage(channel as GuildTextBasedChannel);
      }
    } catch (err) {
      Logger.error('Error checking for existing Wallet Verification message in Discord channel', err);
    }

    // If we found an existing verification message, use its ID for the new rule
    if (existingVerificationMessageId) {
      // Update the new rule with the existing message_id
      await this.dbSvc.updateRuleMessageId(newRule.id, existingVerificationMessageId);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Rule Added')
            .setDescription(`Rule for <#${channel.id}> and <@&${role.id}> added using existing verification message.`)
            .setColor('#00FF00')
        ]
      });
    } else {
      // No existing verification message found, create a new one
      try {
        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
          await interaction.editReply({
            content: 'Selected channel is not a text or announcement channel.'
          });
          return;
        }
        
        const messageId = await this.messageSvc.createVerificationMessage(channel as GuildTextBasedChannel);
        
        // Wait for DB update to complete before replying
        await this.dbSvc.updateRuleMessageId(newRule.id, messageId);
        
        // Optionally, add a short delay to ensure DB consistency
        await new Promise(res => setTimeout(res, 100));
        
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Rule Added')
              .setDescription(`Rule for <#${channel.id}> and <@&${role.id}> added with new verification message.`)
              .setColor('#00FF00')
          ]
        });
      } catch (err) {
        Logger.error('Failed to send Verify Now message', err);
        await interaction.editReply({
          content: 'Failed to send Verify Now message. Please check my permissions and try again.'
        });
        return;
      }
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
            : `ID: ${r.id} | Channel: <#${r.channel_id}> | Role: <@&${r.role_id}> | Slug: ${r.slug || 'ALL'} | Attr: ${r.attribute_key || '-'}=${r.attribute_value || '-'} | Min: ${r.min_items || 0}`
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
