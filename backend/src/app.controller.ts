import { Body, Controller, Post } from '@nestjs/common';

import { VerifyService } from './services/verify.service';

import { DecodedData } from '@/models/app.interface';

@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  @Post('verify-signature')
  verify(
    @Body() body: {
      data: DecodedData & { channelId?: string };
      signature: string;
    }
  ) {
    return this.verifySvc.verifySignatureFlow(
      body.data,
      body.signature
    );
  }
}
