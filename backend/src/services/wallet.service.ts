import { Injectable } from '@nestjs/common';
import { recoverTypedDataAddress } from 'viem';

import { NonceService } from '@/services/nonce.service';
import { DecodedData } from '@/models/app.interface';

/**
 * WalletService
 * 
 * Handles wallet signature verification using EIP-712 typed data signatures.
 * Verifies that a user controls a specific Ethereum address by validating
 * their signature against a structured message containing verification details.
 * 
 * Key responsibilities:
 * - Verify EIP-712 signatures using viem
 * - Validate nonces to prevent replay attacks
 * - Check signature expiry to ensure freshness
 * - Support legacy verification message format
 */
@Injectable()
export class WalletService {

  constructor(
    private nonceSvc: NonceService
  ) {}
  
  /**
   * Verifies an EIP-712 wallet signature for the given verification data.
   * 
   * This method performs several validation steps:
   * 1. Validates the nonce to ensure the request is legitimate and not replayed
   * 2. Checks that the verification hasn't expired
   * 3. Reconstructs the typed data message using EIP-712 format
   * 4. Recovers the signing address from the signature
   * 5. Validates that the recovered address matches expectations
   * 
   * @param data - The decoded verification data containing user and server info
   * @param signature - The EIP-712 signature to verify
   * @returns Promise<string> - The verified wallet address
   * @throws Error if nonce is invalid/expired, verification expired, or signature invalid
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