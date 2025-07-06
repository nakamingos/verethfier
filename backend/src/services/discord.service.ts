import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Events, GatewayIntentBits, GuildTextBasedChannel, InteractionResponse, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';
import { DiscordMessageService } from '@/services/discord-message.service';
import { DiscordVerificationService } from '@/services/discord-verification.service';
import { DiscordCommandsService } from '@/services/discord-commands.service';

import dotenv from 'dotenv';
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);

@Injectable()
export class DiscordService {

  private client: Client | null = null;
  private rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  
  constructor(
    @Inject(NonceService) private nonceSvc: NonceService,
    private readonly dbSvc: DbService,
    private readonly discordMessageSvc: DiscordMessageService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    @Inject(forwardRef(() => DiscordCommandsService))
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
      // Handle autocomplete interactions
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'setup' && interaction.options.getSubcommand() === 'add-rule') {
          const focusedOption = interaction.options.getFocused(true);
          if (focusedOption.name === 'role') {
            await this.handleRoleAutocomplete(interaction);
          }
        }
        return;
      }

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
      } else if (sub === 'recover-verification') {
        await this.discordCommandsSvc.handleRecoverVerification(interaction);
      }
    } catch (error) {
      Logger.error('Error in handleSetup:', error);
      
      // Check if interaction has been deferred or replied to
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'An error occurred while processing your request.'
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: 'An error occurred while processing your request.',
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (replyError) {
        Logger.error('Failed to send error message to user:', replyError);
      }
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
            .addStringOption(option => option.setName('role').setDescription('Select existing role or type new role name to create').setRequired(true).setAutocomplete(true))
            .addStringOption(option => option.setName('slug').setDescription('Asset slug (leave empty for ALL collections)'))
            .addStringOption(option => option.setName('attribute_key').setDescription('Attribute key (leave empty for ALL attributes)'))
            .addStringOption(option => option.setName('attribute_value').setDescription('Attribute value (leave empty for ALL values)'))
            .addIntegerOption(option => option.setName('min_items').setDescription('Minimum items (default: 1)'))
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

  /**
   * Get Discord user information by user ID
   */
  async getUser(userId: string): Promise<any> {
    try {
      if (!this.client) {
        Logger.warn('Discord client not initialized when fetching user');
        return null;
      }
      const user = await this.client.users.fetch(userId);
      return user;
    } catch (error) {
      Logger.warn(`Failed to fetch user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Get Discord guild information by guild ID
   */
  async getGuild(guildId: string): Promise<any> {
    try {
      if (!this.client) {
        Logger.warn('Discord client not initialized when fetching guild');
        return null;
      }
      const guild = await this.client.guilds.fetch(guildId);
      return guild;
    } catch (error) {
      Logger.warn(`Failed to fetch guild ${guildId}:`, error.message);
      return null;
    }
  }

  /**
   * Get Discord role information by guild ID and role ID
   */
  async getRole(guildId: string, roleId: string): Promise<any> {
    try {
      if (!this.client) {
        Logger.warn('Discord client not initialized when fetching role');
        return null;
      }
      const guild = await this.client.guilds.fetch(guildId);
      const role = await guild.roles.fetch(roleId);
      return role;
    } catch (error) {
      Logger.warn(`Failed to fetch role ${roleId} in guild ${guildId}:`, error.message);
      return null;
    }
  }

  /**
   * Handles role autocomplete for the add-rule command.
   * @param interaction - The autocomplete interaction.
   */
  async handleRoleAutocomplete(interaction: any): Promise<void> {
    try {
      const focusedValue = interaction.options.getFocused().toLowerCase();
      const guild = interaction.guild;
      
      if (!guild) {
        await interaction.respond([]);
        return;
      }

      // Get bot member to check role hierarchy
      const botMember = guild.members.me;
      if (!botMember) {
        await interaction.respond([]);
        return;
      }

      // Get bot's highest role position
      const botHighestRole = botMember.roles.highest;

      // Get all roles in the guild that the bot can assign
      const roles = guild.roles.cache
        .filter(role => role.name !== '@everyone')
        .filter(role => role.name.toLowerCase().includes(focusedValue))
        .filter(role => {
          // Bot can only assign roles that are lower in hierarchy than its highest role
          return role.position < botHighestRole.position;
        })
        .filter(role => {
          // Also check if the role is manageable by the bot
          return role.editable;
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .first(24); // Discord allows max 25 choices, save 1 for "create new" option

      const choices = roles.map(role => ({
        name: role.name,
        value: role.name
      }));

      // Check if any role (manageable or not) already exists with the focused value
      const existingRoleWithName = guild.roles.cache.find(role => 
        role.name.toLowerCase() === focusedValue.toLowerCase()
      );

      // Add option to create new role if there's space, user has typed something, 
      // and no role with that name already exists
      if (choices.length < 25 && focusedValue.length > 0 && !existingRoleWithName) {
        choices.push({
          name: `💡 Create new role: "${focusedValue}"`,
          value: focusedValue
        });
      }

      await interaction.respond(choices);
    } catch (error) {
      Logger.error('Error in handleRoleAutocomplete:', error);
      await interaction.respond([]);
    }
  }
}