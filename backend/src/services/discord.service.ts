import { Inject, Injectable, Logger } from '@nestjs/common';

import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CacheType, ChannelType, ChatInputCommandInteraction, Client, EmbedBuilder, Events, GatewayIntentBits, GuildTextBasedChannel, InteractionResponse, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

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
      const channel = interaction.options.getChannel('channel') as GuildTextBasedChannel;
      const roleId = interaction.options.getRole('role')?.id;

      if (!channel) throw new Error('Channel not found');
      if (!roleId) throw new Error('Role not found');

      // Check if the bot has permission to post in that channel
      if (!channel.permissionsFor(interaction.guild.members.resolve(this.client.user.id))?.has('SendMessages')) {
        throw new Error('Bot does not have permission to post in that channel');
      }

      // check if the user has permission to grant the role
      if (!interaction.memberPermissions.has('SendMessages')) {
        throw new Error('User does not have permission to grant the role');
      }

      Logger.debug(`Setting up bot in channel ${channel.name}`);

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('Request Verification')
            .setDescription('Click the button below to initiate the verification process.')
            .setColor('#C3FF00')
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>()
            .setComponents(
              new ButtonBuilder()
                .setCustomId('requestVerification')
                .setLabel('Request Verification')
                .setStyle(ButtonStyle.Primary)
            )
        ]
      });

      await this.dbSvc.addUpdateServer(
        channel.guild.id,
        channel.guild.name,
        roleId
      );

      await interaction.reply({
        content: 'Bot setup successfully',
        ephemeral: true,
      });
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
        // This is a private message !important
        ephemeral: true,
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
        .setDescription('Setup the bot for the first time')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((option) => 
          option
            .setName('channel')
            .setDescription('The channel to setup the bot in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('role')
            .setDescription('The role to assign to verified users')
            .setRequired(true)
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