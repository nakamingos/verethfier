import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  GuildTextBasedChannel,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  Role,
  Guild,
  GuildMember,
} from 'discord.js';

import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';
import { SettingsService } from '@/verification/settings.service';

import dotenv from 'dotenv';
dotenv.config();

const EXPIRY = Number(process.env.NONCE_EXPIRY);

@Injectable()
export class DiscordService {
  private client: Client;
  private started = false;
  private tempMessages: Record<string, ButtonInteraction<CacheType>> = {};
  private rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);

  constructor(
    @Inject(NonceService) private readonly nonceService: NonceService,
    private readonly dbService: DbService,
    private readonly settingsService: SettingsService,
  ) {
    if (Number(process.env.DISCORD)) {
      void this.initializeBot();
    }
  }

  private async initializeBot(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await this.client.login(process.env.DISCORD_BOT_TOKEN!);
    Logger.debug('Discord bot initialized.', this.client.user.tag);

    await this.registerSlashCommands();
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
        await this.handleSetupCommand(interaction as ChatInputCommandInteraction<CacheType>);
      } else if (
        interaction.isButton() &&
        interaction.customId === 'requestVerification'
      ) {
        await this.handleRequestVerification(interaction as ButtonInteraction<CacheType>);
      }
    });
  }

  private async registerSlashCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup the verification bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('Channel for verification')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addRoleOption((opt) =>
          opt
            .setName('role')
            .setDescription('Role to assign upon verification')
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('slug')
            .setDescription('Ethscriptions collection slug')
            .setRequired(true),
        ),
    ];

    const guildIds = (process.env.GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

    for (const guildId of guildIds) {
      try {
        await this.rest.put(
          Routes.applicationGuildCommands(
            process.env.DISCORD_CLIENT_ID!,
            guildId,
          ),
          { body: commands },
        );
        Logger.debug(`Slash commands registered for guild ${guildId}`);
      } catch (err) {
        Logger.error(`Failed to register slash commands for guild ${guildId}`, (err as Error).message);
      }
    }
  }

  private async handleSetupCommand(
    interaction: ChatInputCommandInteraction<CacheType>,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const channel = interaction.options.getChannel('channel') as GuildTextBasedChannel;
      const role = interaction.options.getRole('role');
      const slug = interaction.options.getString('slug');
      if (!channel || !role || !slug) throw new Error('Missing parameters');

      await this.sendVerificationButton(channel);

      await this.settingsService.addMapping(
        interaction.guild.id,
        channel.id,
        slug,
        role.id,
      );

      await interaction.editReply({
        content: `✅ Setup complete for slug **${slug}** in <#${channel.id}>`,
      });
    } catch (err) {
      Logger.error('Setup error', (err as Error)?.message || JSON.stringify(err));
      await interaction.editReply({ content: `❌ Setup failed: ${(err as Error).message}` });
    }
  }

  private async sendVerificationButton(channel: GuildTextBasedChannel): Promise<void> {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Request Verification')
          .setDescription('Click below to verify your wallet')
          .setColor('#C3FF00'),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('requestVerification')
            .setLabel('Verify Now')
            .setStyle(ButtonStyle.Primary),
        ),
      ],
    });
  }

  private async handleRequestVerification(
    interaction: ButtonInteraction<CacheType>,
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    try {
      const guild = interaction.guild!;
      const roleId = await this.dbService.getServerRole(guild.id);
      const role = guild.roles.cache.get(roleId)!;
      const expiry = Math.floor((Date.now() + EXPIRY) / 1000);
      const nonce = await this.nonceService.createNonce(interaction.user.id);
      const channel = interaction.channel as GuildTextBasedChannel;
      const payloadArr = this.buildVerificationPayload(interaction, guild, role, nonce, expiry, channel.id);
      const url = `${process.env.BASE_URL}/verify/${Buffer.from(
        JSON.stringify(payloadArr),
      ).toString('base64')}`;

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Wallet Verification')
            .setDescription(`Your link expires <t:${expiry}:R>`)
            .setColor('#00FF00'),
        ],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel('Verify Now')
              .setURL(url),
          ),
        ],
      });

      this.tempMessages[nonce] = interaction;
    } catch (err) {
      Logger.error('Request error', (err as Error)?.message || err);
      await interaction.followUp({ content: `❌ Error: ${(err as Error).message}`, ephemeral: true });
    }
  }

  private buildVerificationPayload(
    interaction: ButtonInteraction<CacheType>,
    guild: Guild,
    role: Role,
    nonce: string,
    expiry: number,
    channelId: string,
  ): any[] {
    return [
      interaction.user.id,           // userId
      interaction.user.tag,          // userTag
      interaction.user.avatarURL(),  // avatar
      guild.id,                      // discordId
      guild.name,                    // discordName
      guild.iconURL(),               // discordIconURL
      role.id,                       // role
      role.name,                     // roleName
      nonce,                         // nonce
      expiry,
      channelId,
    ];
  }

  async addUserRole(
    userId: string,
    roleId: string,
    guildId: string,
    address: string,
    nonce: string,
  ): Promise<void> {
    const interaction = this.tempMessages[nonce];
    if (!interaction) throw new Error('No interaction found for nonce');
    const guild = this.client.guilds.cache.get(guildId)!;
    const member = await guild.members.fetch(userId);
    const role = guild.roles.cache.get(roleId)!;

    try {
      await member.roles.add(role);
      await this.dbService.addServerToUser(userId, guildId, role.name, address);
      await this.editInteractionReplySuccess(interaction, guild.name);
    } catch (err) {
      Logger.error('Add role error', (err as Error).message);
      await this.editInteractionReplyFailure(interaction, (err as Error).message);
    } finally {
      delete this.tempMessages[nonce];
    }
  }

  private async editInteractionReplySuccess(interaction: ButtonInteraction<CacheType>, guildName: string): Promise<void> {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Verification Successful')
          .setDescription(`Verified in **${guildName}**!`)
          .setColor('#00FF00'),
      ],
    });
  }

  private async editInteractionReplyFailure(interaction: ButtonInteraction<CacheType>, errorMessage: string): Promise<void> {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle('Verification Failed')
          .setDescription(`Error: ${errorMessage}`)
          .setColor('#FF0000'),
      ],
    });
  }

  async throwError(nonce: string, message: string): Promise<void> {
    const interaction = this.tempMessages[nonce];
    if (!interaction) throw new Error('No interaction for nonce');
    try {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('Error')
            .setDescription(message)
            .setColor('#FF0000'),
        ],
      });
    } catch (err) {
      Logger.error('Throw error', (err as Error).message);
    } finally {
      delete this.tempMessages[nonce];
    }
  }
}
