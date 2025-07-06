import { IsString, IsNotEmpty, IsObject, IsOptional, IsNumber } from 'class-validator';

export class VerifySignatureDto {
  // The data object contains the decoded JWT payload
  @IsObject()
  data: {
    userId?: string;
    userTag?: string;
    avatar?: string;
    discordId?: string;
    discordName?: string;
    discordIconURL?: string;
    role?: string;
    roleName?: string;
    nonce?: string;
    expiry?: number;
    address?: string;
    // Allow additional fields that might be present
    [key: string]: any;
  };

  // The signature is required for verification
  @IsString()
  @IsNotEmpty()
  signature: string;

  // Allow additional top-level fields that might be present
  [key: string]: any;
}
