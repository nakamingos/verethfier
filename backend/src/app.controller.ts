import { Body, Controller, Post, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';

import { AppService } from './app.service';
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
  constructor(
    private readonly appService: AppService,
    private readonly verifySvc: VerifyService
  ) {}

  /**
   * Application health check endpoint
   * 
   * Provides basic health and status information for monitoring and debugging.
   * Useful for load balancers, monitoring systems, and development diagnostics.
   * 
   * @returns Object containing health status, timestamp, environment, and version
   */
  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  /**
   * Application information endpoint
   * 
   * Returns metadata about the application including features, architecture,
   * and capabilities. Useful for API consumers to understand system capabilities.
   * 
   * @returns Object containing application name, description, architecture, and features
   */
  @Get('info')
  getInfo() {
    return this.appService.getInfo();
  }

  /**
   * Verifies a wallet signature and processes role assignment.
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
      const result = await this.verifySvc.verifySignatureFlow(
        decodedData,
        body.signature
      );
      return result;
    } catch (error) {
      // Log detailed error information for debugging and monitoring
      const errorMessage = error?.message || 'Unknown error occurred';
      const errorStack = error?.stack || '';
      Logger.error(`Verification error: ${errorMessage}`, errorStack);
      
      // Preserve HTTP exceptions with their intended status codes
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Check if this is a user-friendly verification error that should be shown to the user
      const userFriendlyErrors = [
        'does not own the required assets',
        'does not own any assets',
        'No verification rules found',
        'This verification link has expired',
        'Invalid signature',
        'Signature verification failed'
      ];
      
      const isUserFriendlyError = userFriendlyErrors.some(pattern => 
        errorMessage.includes(pattern)
      );
      
      if (isUserFriendlyError) {
        // Return user-friendly verification errors with BAD_REQUEST status
        throw new HttpException(
          errorMessage,
          HttpStatus.BAD_REQUEST
        );
      }
      
      // Convert unexpected errors to generic 500 responses to avoid information disclosure
      throw new HttpException(
        'Verification failed. Please try again.',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
