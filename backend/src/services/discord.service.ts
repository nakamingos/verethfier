import { Inject, Injectable, Logger, forwardRef, OnModuleInit } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Events, GatewayIntentBits, GuildTextBasedChannel, InteractionResponse, MessageFlags, PermissionFlagsBits, REST, Routes, SlashCommandBuilder, AutocompleteInteraction } from 'discord.js';
import { EnvironmentConfig } from '@/config/environment.config';
import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';
import { DiscordMessageService } from '@/services/discord-message.service';
import { DiscordVerificationService } from '@/services/discord-verification.service';
import { DiscordCommandsService } from '@/services/discord-commands.service';
import { DataService } from '@/services/data.service';
import { VerificationService } from '@/services/verification.service';
import { CONSTANTS } from '@/constants';
import { SETUP_HELP_CONTENT } from '@/content/setup-help.content';

/**
 * Discord Bot Service
 * 
 * This service manages the Discord bot integration for the verification system.
 * It handles:
 * - Bot initialization and client management
 * - Slash command registration and handling
 * - Role autocomplete functionality
 * - Integration with verification, messaging, and command services
 * 
 * The service automatically initializes the Discord bot on startup unless:
 * - Discord is disabled via environment variables
 * - No bot token is provided
 * - Running in test environment
 * 
 * @example
 * ```typescript
 * // The service is automatically initialized by NestJS
 * // Methods can be called through dependency injection
 * await discordService.initializeBot();
 * ```
 */
@Injectable()
export class DiscordService implements OnModuleInit {

  /** The Discord.js client instance, null until initialized */
  private client: Client | null = null;
  
  /** REST API instance for Discord API calls */
  private rest = new REST({ version: '10' }).setToken(EnvironmentConfig.DISCORD_BOT_TOKEN!);
  
  /** Flag to track if the service is fully initialized */
  private isInitialized = false;
  
  /**
   * Creates an instance of DiscordService.
   * 
   * Automatically initializes the Discord bot if conditions are met:
   * - Discord is enabled via DISCORD environment variable
   * - Bot token is provided via DISCORD_BOT_TOKEN
   * - Not running in test environment
   * 
   * @param nonceSvc - Service for managing verification nonces
   * @param dbSvc - Database service for data persistence
   * @param discordMessageSvc - Service for Discord message management
   * @param discordVerificationSvc - Service for handling verification flows
   * @param discordCommandsSvc - Service for Discord slash command handling
   */
  constructor(
    @Inject(NonceService) private nonceSvc: NonceService,
    private readonly dbSvc: DbService,
    private readonly discordMessageSvc: DiscordMessageService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    @Inject(forwardRef(() => DiscordCommandsService))
    private readonly discordCommandsSvc: DiscordCommandsService,
    private readonly verificationSvc: VerificationService,
    private readonly dataSvc: DataService,
  ) {
    // Don't initialize during tests when Discord is disabled
    const isTestEnvironment = EnvironmentConfig.IS_TEST;
    
    if (isTestEnvironment) {
      Logger.debug('Discord initialization skipped in test environment');
    } else if (!EnvironmentConfig.DISCORD_ENABLED || !EnvironmentConfig.DISCORD_BOT_TOKEN) {
      Logger.warn('Discord integration disabled or bot token missing - continuing without Discord functionality');
    }
    // Initialization moved to onModuleInit for proper lifecycle management
  }

  /**
   * NestJS lifecycle hook - called after all modules have been initialized.
   * This ensures all dependencies are ready before Discord bot initialization.
   */
  async onModuleInit(): Promise<void> {
    const isTestEnvironment = EnvironmentConfig.IS_TEST;
    
    // Initialize Discord bot only after all modules are ready
    if (EnvironmentConfig.DISCORD_ENABLED && EnvironmentConfig.DISCORD_BOT_TOKEN && !isTestEnvironment) {
      try {
        await this.initializeBot();
        await this.createSlashCommands();
        this.isInitialized = true;
        Logger.log('Discord bot fully initialized and ready');
      } catch (error) {
        Logger.error('Failed to initialize Discord bot - continuing without Discord functionality', error.message);
      }
    }
  }

  /**
   * Initializes the Discord bot client with proper event handlers.
   * 
   * Sets up the Discord client with:
   * - Required intents for guild operations
   * - Ready event handler for successful connection
   * - Interaction event handlers for commands and autocomplete
   * - Timeout protection to prevent hanging initialization
   * 
   * @returns Promise that resolves when the bot is successfully initialized
   * @throws Error if initialization fails or times out after 10 seconds
   */
  async initializeBot(): Promise<void> {
    if (this.client) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error(`Discord bot initialization timed out after ${CONSTANTS.DISCORD_INITIALIZATION_TIMEOUT / 1000} seconds`));
      }, CONSTANTS.DISCORD_INITIALIZATION_TIMEOUT);

      this.client.on(Events.ClientReady, (readyClient) => {
        clearTimeout(timeout);
        Logger.debug('Discord bot initialized.', readyClient.user.tag);
        // Initialize the new services with the client
        this.discordMessageSvc.initialize(this.client);
        this.discordVerificationSvc.initialize(this.client);
        this.discordCommandsSvc.initialize(this.client);
        resolve();
      });

      this.client.on('error', (error) => {
        clearTimeout(timeout);
        Logger.error('Discord bot initialization failed:', error);
        reject(error);
      });

      this.client.login(EnvironmentConfig.DISCORD_BOT_TOKEN).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }


  /**
   * Creates and registers slash commands for the Discord bot.
   * 
   * This method:
   * - Registers the '/setup' command with subcommands for rule management
   * - Sets up event listeners for interaction handling:
   *   - Autocomplete interactions for role selection
   *   - Chat input command interactions for admin commands
   *   - Button interactions for user verification requests
   * 
   * The '/setup' command includes subcommands for:
   * - add-rule: Create new verification rules
   * - remove-rule: Delete existing rules
   * - list-rules: Display all rules
   * - recover-verification: Recover verification messages
   * - help: Show comprehensive setup help and usage guide
   * 
   * @returns Promise that resolves when slash commands are registered and handlers are set up
   */
  async createSlashCommands(): Promise<void> {
    await this.registerSlashCommands();

    this.client.on('interactionCreate', async (interaction) => {
      // Handle autocomplete interactions for role and slug selection
      if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'setup' && interaction.options.getSubcommand() === 'add-rule') {
          const focusedOption = interaction.options.getFocused(true);
          if (focusedOption.name === 'role') {
            await this.handleRoleAutocomplete(interaction);
          } else if (focusedOption.name === 'slug') {
            await this.handleSlugAutocomplete(interaction);
          } else if (focusedOption.name === 'attribute_key') {
            await this.handleAttributeKeyAutocomplete(interaction);
          } else if (focusedOption.name === 'attribute_value') {
            await this.handleAttributeValueAutocomplete(interaction);
          }
        }
        return;
      }

      // Handle slash command interactions (admin functions)
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'setup') {
          await this.handleSetup(interaction);
        }
      }

      // Handle button interactions (user verification)
      if (interaction.isButton()) {
        if (interaction.customId === 'requestVerification') {
          await this.handleVerificationRequest(interaction);
        }
      }
    });
  }

  /**
   * Handles Discord slash command interactions for the '/setup' command.
   * 
   * Routes subcommands to their respective handlers in the DiscordCommandsService:
   * - 'add-rule': Creates new verification rules
   * - 'remove-rule': Deletes existing verification rules  
   * - 'list-rules': Displays all verification rules for the channel
   * - 'recover-verification': Recovers lost verification messages
   * - 'help': Shows comprehensive help and usage information
   * 
   * Includes comprehensive error handling to ensure users receive feedback
   * even when operations fail, with appropriate ephemeral responses.
   * 
   * @param interaction - The chat input command interaction from Discord
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
      } else if (sub === 'help') {
        await this.handleSetupHelp(interaction);
      }
    } catch (error) {
      Logger.error('Error in handleSetup:', error);
      
      // Check if interaction has been deferred or replied to to avoid API errors
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
   * Handles the '/setup help' subcommand.
   * Provides comprehensive guidance on using all setup commands.
   * 
   * @param interaction - The chat input command interaction from Discord
   */
  async handleSetupHelp(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const embed = new EmbedBuilder()
        .setColor(SETUP_HELP_CONTENT.color)
        .setTitle(SETUP_HELP_CONTENT.title)
        .setDescription(SETUP_HELP_CONTENT.description)
        .addFields(SETUP_HELP_CONTENT.fields)
        .setFooter({ text: SETUP_HELP_CONTENT.footer })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      Logger.error('Error in handleSetupHelp:', error);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({
            content: 'An error occurred while loading help information.'
          });
        } else if (!interaction.replied) {
          await interaction.reply({
            content: 'An error occurred while loading help information.',
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (replyError) {
        Logger.error('Failed to send help error message to user:', replyError);
      }
    }
  }

  /**
   * Unified verification request handler for all rule types.
   * 
   * This handler transparently processes verification requests for both legacy
   * and modern rules using the unified verification engine. The system automatically
   * detects rule types and applies appropriate verification logic without requiring
   * separate code paths.
   * 
   * @param interaction - The button interaction triggered when a user clicks "Verify Now"
   */
  async handleVerificationRequest(interaction: ButtonInteraction<CacheType>): Promise<void> {
    try {
      // Defer the reply early to prevent timeout
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      const guild = interaction.guild;
      if (!guild) throw new Error('Guild not found');
      
      const channel = interaction.channel;
      if (!channel || !('id' in channel)) throw new Error('Channel not found');
      
      // Get all rules for this channel (simplified approach - no more message_id tracking)
      const rules = await this.verificationSvc.getRulesForChannel(
        guild.id,
        channel.id
      );
      
      // If no channel rules found, fall back to all server rules for backwards compatibility
      let serverRules = [];
      if (!rules || rules.length === 0) {
        serverRules = await this.verificationSvc.getAllRulesForServer(guild.id);
      }
      
      const allRules = rules && rules.length > 0 ? rules : serverRules;
      
      if (!allRules || allRules.length === 0) {
        throw new Error('No verification rules found for this server or channel.');
      }
      
      // Route to unified verification handling - no need for legacy-specific routing
      await this.handleUnifiedVerification(interaction);
      
    } catch (error) {
      Logger.error('Error in handleVerificationRequest:', error);
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
   * Handles verification flow using the unified verification system.
   * 
   * This method transparently processes both legacy and modern rules through
   * the unified verification service, eliminating the need for separate handlers.
   * 
   * @param interaction - The button interaction for verification
   */
  async handleUnifiedVerification(interaction: ButtonInteraction<CacheType>): Promise<void> {
    Logger.debug('Routing to unified verification flow');
    return this.discordVerificationSvc.requestVerification(interaction);
  }

  /**
   * Delegates verification request handling to the Discord verification service.
   * 
   * This method serves as a bridge between the main Discord service and the
   * specialized verification service, maintaining separation of concerns.
   * 
   * @param interaction - The button interaction triggered when a user clicks "Verify Now"
   * @returns Promise that resolves when verification request is processed
   * @deprecated Use handleUnifiedVerification() instead for unified routing
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
    await this.discordVerificationSvc.addUserRole(userId, roleId, guildId, address, nonce);
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
            .addStringOption(option => option.setName('slug').setDescription('Asset slug (leave empty for ALL collections)').setAutocomplete(true))
            .addStringOption(option => option.setName('attribute_key').setDescription('Attribute key (leave empty for ALL attributes)').setAutocomplete(true))
            .addStringOption(option => option.setName('attribute_value').setDescription('Attribute value (leave empty for ALL values)').setAutocomplete(true))
            .addIntegerOption(option => option.setName('min_items').setDescription('Minimum items (default: 1)'))
        )
        .addSubcommand(sc =>
          sc.setName('remove-rule')
            .setDescription('Remove verification rule(s)')
            .addStringOption(option => option.setName('rule_id').setDescription('Rule ID(s) - single (e.g., 5) or multiple comma-separated (e.g., 1,2,3)').setRequired(true))
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
        .addSubcommand(sc =>
          sc.setName('help')
            .setDescription('Show help and information about setup commands')
        )
    ];
    Logger.debug('Reloading application /slash commands.', `${commands.length} commands`);
    try {
      await this.rest.put(
        Routes.applicationCommands(EnvironmentConfig.DISCORD_CLIENT_ID!),
        { body: commands },
      );
      Logger.debug('Successfully reloaded application /slash commands.', `${commands.length} commands`);
    } catch (error) {
      Logger.error('Failed to register slash commands:', error);
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
   * Helper to get the correct roleId for verification using the unified system.
   */
  async getVerificationRoleId(guildId: string, channelId: string, messageId: string): Promise<string | null> {
    return this.discordVerificationSvc.getVerificationRoleId(guildId, channelId, messageId);
  }

  /**
   * Check if there's already a verification message in the specified channel
   * @param channel - The Discord channel to search in
   * @returns True if a verification message exists, false otherwise
   */
  async findExistingVerificationMessage(channel: GuildTextBasedChannel): Promise<boolean> {
    return this.discordMessageSvc.findExistingVerificationMessage(channel);
  }

  /**
   * Get Discord user information by user ID
   */
  async getUser(userId: string): Promise<any> {
    try {
      if (!this.client) {
        // Silently return null when client isn't initialized (for non-critical name resolution)
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
        // Silently return null when client isn't initialized (for non-critical name resolution)
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
        // Silently return null when client isn't initialized (for non-critical name resolution)
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
      // Guard against handling interactions before full initialization
      if (!this.isInitialized) {
        Logger.debug('Ignoring autocomplete interaction - service not fully initialized yet');
        await interaction.respond([]);
        return;
      }

      const focusedValue = interaction.options.getFocused(); // Keep original casing
      const focusedValueLower = focusedValue.toLowerCase(); // Use for filtering only
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
        .filter(role => role.name.toLowerCase().includes(focusedValueLower))
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

      const choices = roles.map(role => {
        // Format with @ prefix for better UX
        return {
          name: `@${role.name}`,
          value: role.name
        };
      });

      // Check if any role (manageable or not) already exists with the focused value
      const existingRoleWithName = guild.roles.cache.find(role => 
        role.name.toLowerCase() === focusedValueLower
      );

      // Add option to create new role if there's space, user has typed something, 
      // and no role with that name already exists
      if (choices.length < 25 && focusedValue.length > 0 && !existingRoleWithName) {
        choices.push({
          name: `💡 Create new role: "${focusedValue}"`, // Use original casing in display
          value: focusedValue // Use original casing as value
        });
      }

      await interaction.respond(choices);
    } catch (error) {
      Logger.error('Error in handleRoleAutocomplete:', error);
      // Silently fail with empty response to avoid "Unknown interaction" errors
      try {
        await interaction.respond([]);
      } catch (respondError) {
        Logger.debug('Failed to respond to autocomplete interaction (likely expired):', respondError.message);
      }
    }
  }

  /**
   * Handles slug autocomplete for the add-rule command.
   * Only allows selection of existing slugs from the marketplace database.
   * @param interaction - The autocomplete interaction.
   */
  async handleSlugAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      // Guard against handling interactions before full initialization
      if (!this.isInitialized) {
        Logger.debug('Ignoring autocomplete interaction - service not fully initialized yet');
        await interaction.respond([]);
        return;
      }

      const focusedValue = interaction.options.getFocused().toLowerCase();
      
      // Get all available slugs from the marketplace database
      const allSlugs = await this.dataSvc.getAllSlugs();
      
      // Filter slugs based on user input and exclude 'all-collections' as it's handled by leaving slug empty
      const filteredSlugs = allSlugs
        .filter(slug => slug !== 'all-collections') // Exclude the special 'all-collections' option
        .filter(slug => slug.toLowerCase().includes(focusedValue))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 25); // Discord allows max 25 choices

      const choices = filteredSlugs.map(slug => ({
        name: slug,
        value: slug
      }));

      await interaction.respond(choices);
    } catch (error) {
      Logger.error('Error in handleSlugAutocomplete:', error);
      // Silently fail with empty response to avoid "Unknown interaction" errors
      try {
        await interaction.respond([]);
      } catch (respondError) {
        Logger.debug('Failed to respond to autocomplete interaction (likely expired):', respondError.message);
      }
    }
  }

  /**
   * Handles attribute key autocomplete for the add-rule command.
   * Only shows attribute keys if a slug has been selected.
   * @param interaction - The autocomplete interaction.
   */
  async handleAttributeKeyAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      // Guard against handling interactions before full initialization
      if (!this.isInitialized) {
        Logger.debug('Ignoring autocomplete interaction - service not fully initialized yet');
        await interaction.respond([]);
        return;
      }

      const focusedValue = interaction.options.getFocused().toLowerCase();
      const selectedSlug = interaction.options.getString('slug');
      
      // Only provide autocomplete if a slug has been specifically selected
      if (!selectedSlug) {
        await interaction.respond([
          { name: 'Please select a collection first', value: 'ALL' }
        ]);
        return;
      }
      
      // Add debug logging to track context
      Logger.debug(`Autocomplete for attribute_key: slug="${selectedSlug}", search="${focusedValue}"`);
      
      // Get all available attribute keys for the selected slug
      const allKeys = await this.dataSvc.getAttributeKeys(selectedSlug);
      
      // Improved filtering: show all options if user is editing "ALL" or field is empty
      // Also show all options if focused value is very short (1-2 chars) to avoid over-filtering
      let filteredKeys;
      if (!focusedValue || focusedValue === 'all' || focusedValue.length <= 2) {
        // Show all options when starting fresh or editing "ALL"
        filteredKeys = allKeys.slice(0, 25);
      } else {
        // Only filter when user has typed something specific (3+ chars)
        filteredKeys = allKeys
          .filter(key => key.toLowerCase().includes(focusedValue))
          .slice(0, 25);
      }
      
      // Sort the results alphabetically (no need to handle 'ALL' since it's not included)
      filteredKeys.sort((a, b) => a.localeCompare(b));

      const choices = filteredKeys.map(key => ({
        name: key,
        value: key
      }));

      // Ensure we always have at least one option
      if (choices.length === 0) {
        choices.push({ name: 'No attributes found', value: 'ALL' });
      }

      await interaction.respond(choices);
    } catch (error) {
      Logger.error('Error in handleAttributeKeyAutocomplete:', error);
      // Silently fail with empty response to avoid "Unknown interaction" errors
      try {
        await interaction.respond([
          { name: 'Error loading attributes', value: 'ALL' }
        ]);
      } catch (respondError) {
        Logger.debug('Failed to respond to autocomplete interaction (likely expired):', respondError.message);
      }
    }
  }

  /**
   * Handles attribute value autocomplete for the add-rule command.
   * Only shows attribute values if both slug and attribute key have been selected.
   * @param interaction - The autocomplete interaction.
   */
  async handleAttributeValueAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      // Guard against handling interactions before full initialization
      if (!this.isInitialized) {
        Logger.debug('Ignoring autocomplete interaction - service not fully initialized yet');
        await interaction.respond([]);
        return;
      }

      const focusedValue = interaction.options.getFocused().toLowerCase();
      const selectedSlug = interaction.options.getString('slug');
      const selectedAttributeKey = interaction.options.getString('attribute_key');
      
      // Only provide autocomplete if both slug and attribute key have been specifically selected
      if (!selectedSlug || !selectedAttributeKey) {
        await interaction.respond([
          { name: 'Please select collection and attribute key first', value: 'ALL' }
        ]);
        return;
      }
      
      // Add debug logging to track cache issues
      Logger.debug(`Autocomplete for attribute_value: slug="${selectedSlug}", key="${selectedAttributeKey}", search="${focusedValue}"`);
      
      // Add timeout to prevent Discord interaction timeout
      // Increased timeout for full pagination to ensure accurate counts
      const timeoutPromise = new Promise<string[]>((_, reject) => {
        setTimeout(() => reject(new Error('Autocomplete timeout')), 3000); // 3 second timeout for full pagination
      });
      
      let allValues: string[];
      try {
        // Race between data fetch and timeout
        allValues = await Promise.race([
          this.dataSvc.getAttributeValues(selectedAttributeKey, selectedSlug),
          timeoutPromise
        ]);
      } catch (timeoutError) {
        Logger.warn(`Autocomplete timeout for slug="${selectedSlug}", key="${selectedAttributeKey}"`);
        await interaction.respond([
          { name: 'Loading... (try typing to filter)', value: 'ALL' }
        ]);
        return;
      }
      
      // Improved filtering: show all options if user is editing "ALL" or field is empty
      // Also show all options if focused value is very short (1-2 chars) to avoid over-filtering
      let filteredValues;
      if (!focusedValue || focusedValue === 'all' || focusedValue.length <= 2) {
        // Show all options when starting fresh or editing "ALL"
        // Preserve the rarity-based order from getAttributeValues
        filteredValues = allValues.slice(0, 25);
      } else {
        // Only filter when user has typed something specific (3+ chars)
        // When filtering, we need to preserve the original order (rarity-based)
        // Create a map of original positions to maintain order
        const originalOrder = new Map(allValues.map((value, index) => [value, index]));
        
        filteredValues = allValues
          .filter(value => {
            // Extract the actual value name from "ValueName (5×)" format for filtering
            const match = value.match(/^(.+?)\s+\((\d+)×\)$/);
            const valueName = match ? match[1] : value;
            return valueName.toLowerCase().includes(focusedValue);
          })
          .slice(0, 25)
          .sort((a, b) => {
            // Preserve original rarity-based order (no need to handle 'ALL' anymore)
            return (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0);
          });
      }
      
      // Don't re-sort here - preserve the rarity-based order from getAttributeValues
      // No need to handle 'ALL' specially since it's not included in the results anymore

      const choices = filteredValues.map(value => {
        // Extract the actual value and count from the formatted string
        // Format is "ValueName (5×)" - we want "ValueName" as value and full string as name
        const match = value.match(/^(.+?)\s+\((\d+)×\)$/);
        if (match) {
          const [, actualValue, count] = match;
          return {
            name: value, // Display with count: "Diamond Background (3×)"
            value: actualValue // Clean value for processing: "Diamond Background"
          };
        } else {
          // Fallback for values without count format
          return {
            name: value,
            value: value
          };
        }
      });

      // Ensure we always have at least one option
      if (choices.length === 0) {
        choices.push({ 
          name: 'No values found', 
          value: 'ALL' 
        });
      }

      Logger.debug(`Responding with ${choices.length} choices for ${selectedAttributeKey}`);

      await interaction.respond(choices);
    } catch (error) {
      Logger.error('Error in handleAttributeValueAutocomplete:', error);
      // Silently fail with empty response to avoid "Unknown interaction" errors
      try {
        await interaction.respond([
          { name: 'Error loading values', value: 'ALL' }
        ]);
      } catch (respondError) {
        Logger.debug('Failed to respond to autocomplete interaction (likely expired):', respondError.message);
      }
    }
  }
}