import { Body, Controller, Logger, Post } from '@nestjs/common';

import { WalletService } from '@/services/wallet.service';
import { NonceService } from '@/services/nonce.service';
import { DiscordService } from '@/services/discord.service';

import { DecodedData } from '@/models/app.interface';

@Controller()
export class AppController {

  constructor(
    private readonly walletSvc: WalletService,
    private readonly nonceSvc: NonceService,
    private readonly discordSvc: DiscordService,
  ) {}

  @Post('verify-signature')
  async verify(@Body() data: { data: DecodedData, signature: string }) {
    try {
      const recoveredAddress = await this.walletSvc.verifySignature(
        data.data,
        data.signature
      );
  
      // Invalidate the nonce after its use
      await this.nonceSvc.invalidateNonce(data.data.userId);
      Logger.log(`Nonce deleted for userId: ${data.data.userId}`);

      // Check if the address owns the asset associated to the server and role
      Logger.log(`Verification successful for address: ${recoveredAddress}`);
  
      // Add the role to the user
      await this.discordSvc.addUserRole(data.data.userId, data.data.role, data.data.discordId);
      Logger.log(`Role added to user ${data.data.userId}`);
      
      return {
        message: 'Verification successful',
        address: recoveredAddress,
      };
    } catch (error) {
      return {
        message: 'Verification failed',
        error: error.message,
      };
    }
  }
}
