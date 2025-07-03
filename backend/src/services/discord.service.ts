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
  async handleSetup(interaction: ChatInputCommandInteraction<CacheType>): Promise<void> {
    try {
      // Legacy no-arg /setup
      if (!interaction.options.getSubcommand(false)) {
        await interaction.reply({
          content: '⚠️ The legacy /setup command is deprecated. Please use /setup add-rule, remove-rule, or list-rules.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      const sub = interaction.options.getSubcommand();
      if (sub === 'add-rule') {
        // Prevent adding new rule if legacy rule exists
        const { data: legacyRoles, error } = await this.dbSvc.getLegacyRoles(interaction.guild.id);
        if (error) throw error;
        if (legacyRoles && legacyRoles.length > 0) {
          await interaction.reply({
            content: 'You must migrate or remove the legacy rule(s) for this server before adding new rules. Use /setup migrate-legacy-rule or /setup remove-legacy-rule.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        const slug = interaction.options.getString('slug') || null;
        const attrKey = interaction.options.getString('attribute_key') || null;
        const attrVal = interaction.options.getString('attribute_value') || null;
        const minItems = interaction.options.getInteger('min_items') || null;
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
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Rule Added')
              .setDescription(`Rule for <#${channel.id}> and <@&${role.id}> added.`)
              .setColor('#00FF00')
          ],
          flags: MessageFlags.Ephemeral
        });
      } else if (sub === 'remove-rule') {
        const ruleId = interaction.options.getInteger('rule_id');
        try {
          await this.dbSvc.deleteRoleMapping(String(ruleId), interaction.guild.id);
          await interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('Rule Removed')
                .setDescription(`Rule ID ${ruleId} removed.`)
                .setColor('#FF0000')
            ],
            flags: MessageFlags.Ephemeral
          });
        } catch (err) {
          await interaction.reply({
            content: `Error: ${err.message}`,
            flags: MessageFlags.Ephemeral
          });
        }
      } else if (sub === 'list-rules') {
        // No channel option: list all rules for the server
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
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('Verification Rules')
              .setDescription(desc)
              .setColor('#C3FF00')
          ],
          flags: MessageFlags.Ephemeral
        });
      } else if (sub === 'remove-legacy-rule') {
        // Remove all legacy roles for this guild using DbService
        const { removed } = await this.dbSvc.removeAllLegacyRoles(interaction.guild.id);
        if (!removed.length) {
          await interaction.reply({
            content: 'No legacy rules found for this server.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        const removedRoles = removed.map(r => `<@&${r.role_id}>`).join(', ');
        await interaction.reply({
          content: `Removed legacy rule(s): ${removedRoles}`,
          flags: MessageFlags.Ephemeral
        });
      } else if (sub === 'migrate-legacy-rule') {
        // Migrate legacy role to a new rule for this guild
        const channel = interaction.options.getChannel('channel');
        // Get legacy roles for this guild
        const { data: legacyRoles, error } = await this.dbSvc.getLegacyRoles(interaction.guild.id);
        if (error) throw error;
        if (!legacyRoles || legacyRoles.length === 0) {
          await interaction.reply({
            content: 'No legacy rules found for this server.',
            flags: MessageFlags.Ephemeral
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
          }
        }
        await this.dbSvc.removeAllLegacyRoles(interaction.guild.id);
        let msg = '';
        if (created.length) msg += `Migrated legacy rule(s) to new rule(s) for channel <#${channel.id}>: ${created.join(', ')}. `;
        if (alreadyPresent.length) msg += `Legacy rule(s) already exist as new rule(s) for channel <#${channel.id}>: ${alreadyPresent.join(', ')}. `;
        msg += 'Removed legacy rule(s).';
        await interaction.reply({
          content: msg,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: `Error: ${error.message}`,
        ephemeral: true
      });
    }
  }

  /**
   * Requests verification from the user by sending a verification link.
   * @param interaction - The button interaction triggered by the user.
   */
  async requestVerification(interaction: ButtonInteraction<CacheType>): Promise<void> {
    try {
      const guild = interaction.guild;
      const roleId = await this.dbSvc.getServerRole(guild.id);
      const role = guild.roles.cache.get(roleId);
      if (!role) throw new Error('Role not found');

      // Check if user is already verified
      // const userServers = await this.dbSvc.getUserServers(interaction.user.id);
      // if (userServers?.servers?.[guild.id]) {
      //   await interaction.reply({
      //     embeds: [
      //       new EmbedBuilder()
      //         .setTitle('Verification Request')
      //         .setDescription('You have already been verified in this server.')
      //         .setColor('#FF0000')
      //     ],
      //     ephemeral: true,
      //   });
        
      //   return;
      // }

      // Create a nonce
      const expiry = Math.floor((Date.now() + EXPIRY) / 1000);
      const nonce = await this.nonceSvc.createNonce(
        interaction.user.id
      );
      
      // Encode the payload
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
      await interaction.reply({
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
        ],
        flags: MessageFlags.Ephemeral,
      });

      // Store the temp message
      this.tempMessages[nonce] = interaction;

      Logger.debug(`Sent verification link to ${interaction.user.tag}`);
    } catch (error) {
      console.error(error);
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
    // console.log({guild});

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');
    // console.log({member});

    const role = guild.roles.cache.get(roleId);
    if (!role) throw new Error('Role not found');
    // console.log({role});
      
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
   * Throws an error to the user in Discord.
   * @param discordId - The Discord ID of the user.
   * @param error - The error message to send.
   */
  async throwError(nonce: string, message: string): Promise<void> {
    const storedInteraction = this.tempMessages[nonce];
    if (!storedInteraction) {
      throw new Error('No stored interaction found for this nonce');
    }

    try {
      await storedInteraction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Verification Failed')
            .setDescription(`${message}`)
            .setColor('#FF0000')
        ],
      });
    } catch (error) {
      console.error(error);
    } finally {
      // Delete the temp message
      delete this.tempMessages[nonce];
    }
  }
}