import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SettingsService } from '@/verification/settings.service';
import { DataService } from '../src/services/data.service';
import { DiscordService as ExternalDiscordService } from '../src/services/discord.service';
import { WalletService } from '../src/services/wallet.service';
import { DecodedData } from '../src/models/app.interface';
import { NonceService } from '@/services/nonce.service';
import { DbService } from '@/services/db.service';
import { Client, GatewayIntentBits } from 'discord.js';

export interface VerifyRequestDto {
  data: DecodedData;
  signature: string;
  channelId: string;
}

export interface VerifyResult {
  success: boolean;
  reason?: string;
}

@Injectable()
export class VerificationService {
  private client: Client;
  private started = false;     // ← guard flag

  constructor(
    private readonly nonceSvc: NonceService,
    private readonly dbSvc: DbService,
    private readonly settingsService: SettingsService,
  ) {
    if (Number(process.env.DISCORD)) {
      this.initializeBot();
    }
  }

  private async initializeBot() {
    if (this.started) return;   // ← bail out on second call
    this.started = true;

    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await this.client.login(process.env.DISCORD_BOT_TOKEN);

    Logger.debug('Discord bot initialized.', this.client.user.tag);

    await this.registerSlashCommands();

    this.client.on('interactionCreate', async (i) => {
      if (i.isChatInputCommand() && i.commandName === 'setup')
        await this.handleSetup(i);
      else if (i.isButton() && i.customId === 'requestVerification')
        await this.requestVerification(i);
    });
  }

  private async handleSetup(interaction: any): Promise<void> {
    // TODO: Implement the setup command handler logic here
    // For now, just reply to the interaction to avoid errors
    if (interaction && typeof interaction.reply === 'function') {
      await interaction.reply({ content: 'Setup command received.', ephemeral: true });
    }
  }

  private async registerSlashCommands(): Promise<void> {
    // TODO: Implement slash command registration logic here
    // For now, this is a stub to satisfy the type checker.
    return;
  }

  private async requestVerification(interaction: any): Promise<void> {
    // TODO: Implement the verification request logic here
    // For now, just reply to the interaction to avoid errors
    if (interaction && typeof interaction.reply === 'function') {
      await interaction.reply({ content: 'Verification request received.', ephemeral: true });
    }
  }
}