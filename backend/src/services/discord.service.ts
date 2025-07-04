import { Inject, Injectable, Logger } from '@nestjs/common';

import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Events, GatewayIntentBits, GuildTextBasedChannel, InteractionResponse, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';

import dotenv from 'dotenv';
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);

Injectable()
export class DiscordService {

  private client: Client | null = null;
  private rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  tempMessages: {
    [nonce: string]: ButtonInteraction<CacheType>;
  } = {};
  
  constructor(
    @Inject(NonceService) private nonceSvc: NonceService,
    private readonly dbSvc: DbService,
  ) {
    if (Number(process.env.DISCORD)) {
      this.initializeBot()
        .then(() => this.createSlashCommands())
        .catch((error) => Logger.error('Failed to initialize bot', error));
    }
  }

  /**
   * Initializes the Discord bot.
   * @returns A promise that resolves when the bot is initialized.
   */
  async initializeBot(): Promise<void> {
    if (this.client) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

      this.client.on(Events.ClientReady, (readyClient) => {
        Logger.debug('Discord bot initialized.', readyClient.user.tag);
        resolve();
      });

      this.client.login(process.env.DISCORD_BOT_TOKEN);
    })
  }


  /**
   * Creates slash commands for the bot.
   * This method registers a slash command named 'setup' with a description and a required channel option.
   * It uses the Discord REST API to register the commands.
   * @returns A Promise that resolves when the slash commands are successfully registered.
   */
  async createSlashCommands(): Promise<void> {
    await this.registerSlashCommands();

    this.client.on('interactionCreate', async (interaction) => {
      // Handle command interactions (admin)
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'setup') {
          await this.handleSetup(interaction);
        }
      }

      // Handle button interactions (user)
      if (interaction.isButton()) {
        if (interaction.customId === 'requestVerification') {
          await this.requestVerification(interaction);
        }
      }
    });
  }

  /**
   * Handles the setup process for the bot when a command interaction is received.
   * @param interaction - The command interaction object.
   */
  async handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const sub = interaction.options.getSubcommand();
      
      if (sub === 'add-rule') {
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
        const minItems = interaction.options.getInteger('min_items') || null;
        
        // Defer the reply early to prevent timeout
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const rule = await this.dbSvc.addRoleMapping(
          interaction.guild.id,
          interaction.guild.name,
          channel.id,
          slug,
          role.id,
          attrKey,
          attrVal,
          minItems
        );
        
        Logger.debug('addRoleMapping result:', rule);
        const newRule = rule;
        
        // Check for existing Wallet Verification message in the Discord channel
        let existingVerificationMessageId = null;
        try {
          if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
            existingVerificationMessageId = await this.findExistingVerificationMessage(channel as GuildTextBasedChannel);
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
            
          try {
            if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
              await interaction.editReply({
                content: 'Selected channel is not a text or announcement channel.'
              });
              return;
            }
            
            const sentMessage = await (channel as GuildTextBasedChannel).send({
              embeds: [verifyEmbed],
              components: [verifyButton],
            });
            
            // Wait for DB update to complete before replying
            await this.dbSvc.updateRuleMessageId(newRule.id, sentMessage.id);
            
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
      } else if (sub === 'remove-rule') {
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
      } else if (sub === 'list-rules') {
        // No channel option: list all rules for the server
        
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
      } else if (sub === 'remove-legacy-rule') {
        // Remove all legacy roles for this guild using DbService
        
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
      } else if (sub === 'migrate-legacy-rule') {
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
    } catch (error) {
      console.error(error);
      // Check if we've already replied or deferred
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
      console.error(error);
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
      console.error(error);

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
   * Registers slash commands for the bot.
   * This method sends a POST request to the Discord API to register the slash commands.
   * @returns A Promise that resolves when the slash commands are successfully registered.
   */
  async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup the bot for the first time or manage rules')
        .addSubcommand(sc =>
          sc.setName('add-rule')
            .setDescription('Add a new verification rule')
            .addChannelOption(option => option.setName('channel').setDescription('Channel').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('Role').setRequired(true))
            .addStringOption(option => option.setName('slug').setDescription('Asset slug (optional)'))
            .addStringOption(option => option.setName('attribute_key').setDescription('Attribute key (optional)'))
            .addStringOption(option => option.setName('attribute_value').setDescription('Attribute value (optional)'))
            .addIntegerOption(option => option.setName('min_items').setDescription('Minimum items (optional)'))
        )
        .addSubcommand(sc =>
          sc.setName('remove-rule')
            .setDescription('Remove a verification rule')
            .addIntegerOption(option => option.setName('rule_id').setDescription('Rule ID').setRequired(true))
        )
        .addSubcommand(sc =>
          sc.setName('list-rules')
            .setDescription('List all verification rules')
        )
        .addSubcommand(sc =>
          sc.setName('remove-legacy-rule')
            .setDescription('Remove all legacy roles for this server (if any)')
        )
        .addSubcommand(sc =>
          sc.setName('migrate-legacy-rule')
            .setDescription('Migrate a legacy rule to a new rule (prompts for channel)')
            .addChannelOption(option => option.setName('channel').setDescription('Channel for the new rule').setRequired(true))
        )
    ];
    Logger.debug('Reloading application /slash commands.', `${commands.length} commands`);
    try {
      await this.rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands },
      );
      Logger.debug('Successfully reloaded application /slash commands.', `${commands.length} commands`);
    } catch (error) {
      console.error(error);
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
}