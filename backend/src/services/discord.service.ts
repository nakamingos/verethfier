import { Inject, Injectable, Logger } from '@nestjs/common';

import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Events, GatewayIntentBits, GuildTextBasedChannel, InteractionResponse, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';
import { DiscordMessageService } from '@/services/discord-message.service';
import { DiscordVerificationService } from '@/services/discord-verification.service';
import { DiscordCommandsService } from '@/services/discord-commands.service';

import dotenv from 'dotenv';
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);

Injectable()
export class DiscordService {

  private client: Client | null = null;
  private rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  
  constructor(
    @Inject(NonceService) private nonceSvc: NonceService,
    private readonly dbSvc: DbService,
    private readonly discordMessageSvc: DiscordMessageService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    private readonly discordCommandsSvc: DiscordCommandsService,
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
        // Initialize the new services with the client
        this.discordMessageSvc.initialize(this.client);
        this.discordVerificationSvc.initialize(this.client);
        this.discordCommandsSvc.initialize(this.client);
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
          await this.discordVerificationSvc.requestVerification(interaction);
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
        await this.discordCommandsSvc.handleAddRule(interaction);
      } else if (sub === 'remove-rule') {
        await this.discordCommandsSvc.handleRemoveRule(interaction);
      } else if (sub === 'list-rules') {
        await this.discordCommandsSvc.handleListRules(interaction);
      } else if (sub === 'remove-legacy-rule') {
        await this.discordCommandsSvc.handleRemoveLegacyRule(interaction);
      } else if (sub === 'migrate-legacy-rule') {
        await this.discordCommandsSvc.handleMigrateLegacyRule(interaction);
      } else if (sub === 'recover-verification') {
        await this.discordCommandsSvc.handleRecoverVerification(interaction);
      }
    } catch (error) {
      Logger.error('Error in handleSetup:', error);
      await interaction.reply({
        content: 'An error occurred while processing your request.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
  /**
   * Requests verification from the user by sending a verification link.
   * @param interaction - The button interaction triggered by the user.
   */
  async requestVerification(interaction: ButtonInteraction<CacheType>): Promise<void> {
    return this.discordVerificationSvc.requestVerification(interaction);
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
    return this.discordVerificationSvc.addUserRole(userId, roleId, guildId, address, nonce);
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
        .addSubcommand(sc =>
          sc.setName('recover-verification')
            .setDescription('Recover verification setup for a channel (creates new message, updates orphaned rules)')
            .addChannelOption(option => option.setName('channel').setDescription('Channel to recover verification for').setRequired(true))
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
    return this.discordVerificationSvc.throwError(nonce, message);
  }

  /**
   * Helper to get the correct roleId for verification, supporting both legacy and new rules.
   */
  async getVerificationRoleId(guildId: string, channelId: string, messageId: string): Promise<string | null> {
    return this.discordVerificationSvc.getVerificationRoleId(guildId, channelId, messageId);
  }

  /**
   * Searches for existing Wallet Verification messages in a Discord channel.
   * Looks for messages with "Wallet Verification" embed title and "Verify Now" button.
   * @param channel - The Discord channel to search in
   * @returns The message ID of the existing verification message, or null if not found
   */
  async findExistingVerificationMessage(channel: GuildTextBasedChannel): Promise<string | null> {
    return this.discordMessageSvc.findExistingVerificationMessage(channel);
  }
}