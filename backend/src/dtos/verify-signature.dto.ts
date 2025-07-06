import { IsString, IsNotEmpty, IsObject, ValidateNested, IsNumber, IsOptional, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';

export class DecodedDataDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  userTag: string;

  @IsString()
  @IsUrl()
  avatar: string;

  @IsString()
  @IsNotEmpty()
  discordId: string;

  @IsString()
  @IsNotEmpty()
  discordName: string;

  @IsString()
  @IsUrl()
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

  @IsString()
  @IsNotEmpty()
  address: string;
}

export class VerifySignatureDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DecodedDataDto)
  data: DecodedDataDto;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
