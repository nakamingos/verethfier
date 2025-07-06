import { Body, Controller, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { VerifyService } from './services/verify.service';
import { VerifySignatureDto } from './dtos/verify-signature.dto';

@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  @Post('verify-signature')
  async verify(@Body() body: VerifySignatureDto) {
    try {
      const result = await this.verifySvc.verifySignatureFlow(
        body.data,
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
