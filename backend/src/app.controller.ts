import { Body, Controller, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { VerifyService } from './services/verify.service';
import { VerifySignatureDto } from './dtos/verify-signature.dto';
import { DecodedData } from './models/app.interface';

/**
 * AppController
 * 
 * Main REST API controller for the verification system.
 * Provides the primary endpoint for wallet signature verification.
 * 
 * Handles secure communication between the frontend verification interface
 * and the backend verification services.
 */
@Controller()
export class AppController {
  constructor(private readonly verifySvc: VerifyService) {}

  /**
   * Verifies a wallet signature and processes role assignment.
   * 
   * This is the main API endpoint that receives verification requests from the frontend.
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
   * @returns Promise<{message: string, address: string}> - Verification result
   * @throws HttpException with appropriate status codes for various error conditions
   */
  @Post('verify-signature')
  async verify(@Body() body: VerifySignatureDto) {
    try {
      // Transform DTO data to match expected DecodedData interface
      // This mapping ensures compatibility between frontend and backend data structures
      const decodedData = {
        address: body.data.address || '',
        userId: body.data.userId || '',
        userTag: body.data.userTag || '',
        avatar: body.data.avatar || '',
        discordId: body.data.discordId || '',
        discordName: body.data.discordName || '',
        discordIcon: body.data.discordIconURL || body.data.discordIcon || '',
        role: body.data.role || '',        // Legacy field - TODO: Remove in v3
        roleName: body.data.roleName || '', // Legacy field - TODO: Remove in v3
        nonce: body.data.nonce || '',
        expiry: body.data.expiry || 0,
      };

      // Delegate to VerifyService for the complete verification and role assignment flow
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
