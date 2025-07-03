import { Injectable, Logger } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { NonceService }  from './nonce.service';
import { DiscordService } from './discord.service';
import { DataService }   from './data.service';
import { DbService }     from './db.service';
import { DecodedData }   from '@/models/app.interface';
import { matchesRule }   from './utils/match-rule.util';

@Injectable()
export class VerifyService {
  constructor(
    private readonly walletSvc: WalletService,
    private readonly nonceSvc: NonceService,
    private readonly discordSvc: DiscordService,
    private readonly dataSvc: DataService,
    private readonly dbSvc: DbService,
  ) {}

  async verifySignatureFlow(
    payload: DecodedData & { channelId?: string },
    signature: string
  ) {
    const address = await this.walletSvc.verifySignature(payload, signature);
    await this.nonceSvc.invalidateNonce(payload.userId);
    Logger.log(`Nonce deleted for userId: ${payload.userId}`);

    // --- Legacy path ---
    if (payload.role) {
      const legacyRoleId = await this.dbSvc.getServerRole(payload.discordId);
      await this.discordSvc.addUserRole(
        payload.userId,
        legacyRoleId,
        payload.discordId,
        address,
        payload.nonce
      );
      await this.dbSvc.logUserRole(
        payload.userId,
        payload.discordId,
        legacyRoleId,
        address
      );
      return { message: 'Verification successful (legacy)', address };
    }

    // --- New multi-rule path ---
    const assets = await this.dataSvc.getDetailedAssets(address);
    // Only get rules for the current guild
    const rules  = await this.dbSvc.getRoleMappings(
      payload.discordId
    );
    const matched = rules.filter(r => matchesRule(r, assets, payload.channelId));
    if (!matched.length) {
      await this.discordSvc.throwError(payload.nonce, 'No matching assets');
      throw new Error('No matching assets');
    }

    for (const r of matched) {
      await this.discordSvc.addUserRole(
        payload.userId,
        r.role_id,
        payload.discordId,
        address,
        payload.nonce
      );
      await this.dbSvc.logUserRole(
        payload.userId,
        payload.discordId,
        r.role_id,
        address
      );
    }
    return { message: 'Verification successful', address };
  }
}
