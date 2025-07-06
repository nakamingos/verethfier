import { Body, Controller, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { VerifyService } from './services/verify.service';
import { VerifySignatureDto } from './dtos/verify-signature.dto';
import { DecodedData } from './models/app.interface';

@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  @Post('verify-signature')
  async verify(@Body() body: VerifySignatureDto) {
    try {
      // Convert DTO data to match expected interface
      const decodedData = {
        address: body.data.address || '',
        userId: body.data.userId || '',
        userTag: body.data.userTag || '',
        avatar: body.data.avatar || '',
        discordId: body.data.discordId || '',
        discordName: body.data.discordName || '',
        discordIcon: body.data.discordIconURL || body.data.discordIcon || '',
        role: body.data.role || '',
        roleName: body.data.roleName || '',
        nonce: body.data.nonce || '',
        expiry: body.data.expiry || 0,
      };

      const result = await this.verifySvc.verifySignatureFlow(
        decodedData,
        body.signature
      );
      return result;
    } catch (error) {
      // Log error for debugging but don't expose internal details
      Logger.error(`Verification error: ${error.message}`, error.stack);
      
      // Return safe error message to frontend
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Generic error for unexpected issues
      throw new HttpException(
        'Verification failed. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
