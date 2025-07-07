import { Body, Controller, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { VerifyService } from './services/verify.service';
import { VerifySignatureDto } from './dtos/verify-signature.dto';
import { DecodedData } from './models/app.interface';

/**
 * AppController
 * 
 * Main REST API controller for the unified verification system.
 * Provides the primary endpoint for wallet signature verification that
 * transparently handles both legacy and modern verification rules.
 * 
 * The unified verification engine automatically detects the rule type
 * and processes verification accordingly, eliminating the need for
 * separate legacy endpoints or API consumers to differentiate between rule types.
 * 
 * Handles secure communication between the frontend verification interface
 * and the backend verification services.
 */
@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  /**
   * Verifies a wallet signature and processes role assignment using the unified verification system.
   * 
   * This endpoint transparently handles both legacy and modern verification rules without
   * requiring API consumers to know the rule type. The verification engine automatically:
   * 1. Detects whether rules are legacy (migrated) or modern
   * 2. Applies the appropriate verification logic
   * 3. Processes role assignments based on matching criteria
   * 
   * The flow includes:
   * 1. Validate the request structure using DTO validation
   * 2. Transform the payload to match internal interfaces
   * 3. Delegate to VerifyService for signature verification and role assignment
   * 4. Return success result or handle errors gracefully
   * 
   * Security considerations:
   * - All errors are logged but sanitized before returning to prevent information disclosure
   * - Generic error messages are returned to avoid exposing internal system details
   * - Input validation is handled by class-validator decorators on the DTO
   * 
   * @param body - The verification request containing data and signature
   * @returns Promise<{message: string, address: string, assignedRoles: string[]}> - Verification result
   * @throws HttpException with appropriate status codes for various error conditions
   */
  @Post('verify-signature')
  async verify(@Body() body: VerifySignatureDto) {
    try {
      // Transform DTO data to match expected DecodedData interface
      // The unified verification system automatically handles both legacy and modern rules
      const decodedData = {
        address: body.data.address || '',
        userId: body.data.userId || '',
        userTag: body.data.userTag || '',
        avatar: body.data.avatar || '',
        discordId: body.data.discordId || '',
        discordName: body.data.discordName || '',
        discordIcon: body.data.discordIconURL || body.data.discordIcon || '',
        nonce: body.data.nonce || '',
        expiry: body.data.expiry || 0,
      };

      // Delegate to VerifyService for the complete verification and role assignment flow
      // The verification engine automatically detects and processes legacy vs modern rules
      const result = await this.verifySvc.verifySignatureFlow(
        decodedData,
        body.signature
      );
      return result;
    } catch (error) {
      // Log detailed error information for debugging and monitoring
      Logger.error(`Verification error: ${error.message}`, error.stack);
      
      // Preserve HTTP exceptions with their intended status codes
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Convert unexpected errors to generic 500 responses to avoid information disclosure
      throw new HttpException(
        'Verification failed. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
