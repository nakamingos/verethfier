import { Injectable } from '@nestjs/common';
import { recoverTypedDataAddress } from 'viem';

import { NonceService } from '@/services/nonce.service';
import { DecodedData } from '@/models/app.interface';

@Injectable()
export class WalletService {

  constructor(
    private nonceSvc: NonceService
  ) {}
  
  /**
   * Verifies the wallet signature for the given data.
   * 
   * @param data - The decoded data to be verified.
   * @param signature - The signature to be verified.
   * @returns The address if the signature is valid.
   * @throws Error if the nonce is invalid or expired, or if the verification has expired, or if the signature is invalid.
   */
  async verifySignature(
    data: DecodedData,
    signature: string
  ): Promise<string> {

    // Fetch the nonce for the user
    const userNonce = await this.nonceSvc.validateNonce(data.userId, data.nonce);
    if (!userNonce) throw new Error('Invalid or expired nonce.');

    // Check if verification has expired
    const expiry = new Date(data.expiry * 1000).getTime();
    const expired = expiry < Date.now();
    if (expired) throw new Error('Verification has expired.');

    // Create message to sign
    const domain = {
      name: 'verethfier',
      version: '1',
      chainId: 1,
    };

    const types = {
      Verification: [
        { name: 'UserID', type: 'string' },
        { name: 'UserTag', type: 'string' },
        { name: 'ServerID', type: 'string' },
        { name: 'ServerName', type: 'string' },
        { name: 'RoleID', type: 'string' }, // TODO(v3): deprecated, remove when legacy buttons are phased out
        { name: 'RoleName', type: 'string' }, // TODO(v3): deprecated, remove when legacy buttons are phased out
        { name: 'Nonce', type: 'string' },
        { name: 'Expiry', type: 'uint256' },
      ]
    };

    const message = {
      UserID: data.userId,
      UserTag: data.userTag,
      ServerID: data.discordId,
      ServerName: data.discordName,
      RoleID: data.role, // TODO(v3): deprecated, remove when legacy buttons are phased out
      RoleName: data.roleName, // TODO(v3): deprecated, remove when legacy buttons are phased out
      Nonce: data.nonce,
      Expiry: data.expiry,
    };

    const typedData = {
      types,
      domain,
      message,
    };

    const address = await recoverTypedDataAddress({ 
      domain: typedData.domain,
      types: typedData.types,
      primaryType: 'Verification',
      message: typedData.message,
      signature: signature as `0x${string}`
    });

    if (address !== data.address) throw new Error('Invalid signature.');
    return address;
  }
}