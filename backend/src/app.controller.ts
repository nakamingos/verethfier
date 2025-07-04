import { Body, Controller, Post, HttpException, HttpStatus } from '@nestjs/common';

import { VerifyService } from './services/verify.service';

import { DecodedData } from '@/models/app.interface';

@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  @Post('verify-signature')
  async verify(
    @Body() body: {
      data: DecodedData & { address?: string };
      signature: string;
    }
  ) {
    try {
      const result = await this.verifySvc.verifySignatureFlow(
        body.data,
        body.signature
      );
      return result;
    } catch (error) {
      // Return user-friendly error message to frontend
      return {
        error: error.message || 'An error occurred during verification'
      };
    }
  }
}
