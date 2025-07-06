import { IsString, IsNotEmpty, IsObject, ValidateNested, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { DecodedData } from '@/models/app.interface';

export class DecodedDataDto implements DecodedData {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  userTag: string;

  @IsString()
  @IsNotEmpty()
  avatar: string;

  @IsString()
  @IsNotEmpty()
  discordId: string;

  @IsString()
  @IsNotEmpty()
  discordName: string;

  @IsString()
  @IsNotEmpty()
  discordIcon: string;

  @IsString()
  @IsNotEmpty()
  role: string;

  @IsString()
  @IsNotEmpty()
  roleName: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;

  @IsNumber()
  expiry: number;
}

export class VerifySignatureDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DecodedDataDto)
  data: DecodedDataDto & { address?: string };

  @IsString()
  @IsNotEmpty()
  signature: string;
}
