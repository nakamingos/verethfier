import { IsString, IsNotEmpty, IsObject, IsOptional, IsNumber } from 'class-validator';

/**
 * VerifySignatureDto
 * 
 * Data Transfer Object for wallet signature verification requests.
 * Validates the structure of verification payloads sent from the frontend
 * after users sign verification messages with their wallets.
 * 
 * Contains:
 * - data: Decoded JWT payload with user, server, and verification details
 * - signature: EIP-712 signature from the user's wallet
 * 
 * The unified verification system automatically handles both legacy and modern
 * verification rules transparently without requiring different API structures.
 */
export class VerifySignatureDto {
  /**
   * The decoded verification data object.
   * Contains user information, Discord server details, and verification metadata.
   * The verification engine automatically detects and processes the appropriate
   * rule type without requiring legacy-specific fields.
   */
  @IsObject()
  data: {
    userId?: string;
    userTag?: string;
    avatar?: string;
    discordId?: string;
    discordName?: string;
    discordIconURL?: string;
    nonce?: string;
    expiry?: number;
    address?: string;
    // Allow additional fields for forward compatibility
    [key: string]: any;
  };

  /**
   * The EIP-712 signature from the user's wallet.
   * Used to verify the user controls the claimed Ethereum address.
   */
  @IsString()
  @IsNotEmpty()
  signature: string;

  // Allow additional top-level fields for extensibility
  [key: string]: any;
}
