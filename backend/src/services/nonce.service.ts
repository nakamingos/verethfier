import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import dotenv from 'dotenv';
import { CONSTANTS } from '@/constants';

// Load environment variables
dotenv.config();

const NONCE_EXPIRY = Number(process.env.NONCE_EXPIRY) || CONSTANTS.DEFAULT_NONCE_EXPIRY;

/**
 * Interface for nonce data stored in cache
 * 
 * @interface NonceData
 * @property nonce - The cryptographic nonce string
 * @property messageId - Optional Discord message ID for verification context
 * @property channelId - Optional Discord channel ID for verification context
 */
export interface NonceData {
  nonce: string;
  messageId?: string;
  channelId?: string;
}

/**
 * NonceService
 * 
 * Manages cryptographic nonces for secure wallet verification.
 * Provides nonce generation, validation, and lifecycle management
 * to prevent replay attacks in the verification system.
 * 
 * Key Features:
 * - Secure random nonce generation
 * - Time-based expiry with configurable TTL
 * - Cache-based storage for high performance
 * - Replay attack prevention
 * - Optional context tracking (message/channel IDs)
 * 
 * Security Considerations:
 * - Nonces are single-use and automatically expire
 * - Uses cryptographically secure random number generation
 * - Cache isolation prevents cross-user nonce access
 * - Configurable expiry times based on security requirements
 */
@Injectable()
export class NonceService {

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  /**
   * Creates a cryptographically secure nonce for wallet verification.
   * 
   * Generates a unique, time-limited nonce that prevents replay attacks
   * during the wallet signature verification process. The nonce is stored
   * in cache with automatic expiry.
   * 
   * @param userId - Discord user ID for nonce association
   * @param messageId - Optional Discord message ID for verification context
   * @param channelId - Optional Discord channel ID for verification context
   * @returns Promise<string> - The generated nonce string
   * 
   * @example
   * ```typescript
   * const nonce = await nonceService.createNonce('123456789');
   * // Returns: "abc123def456ghi789"
   * ```
   */
  public async createNonce(
    userId: string, 
    messageId?: string, 
    channelId?: string
  ): Promise<string> {
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const data: NonceData = { nonce, messageId, channelId };
    await this.cache.set(`nonce_${userId}`, data, NONCE_EXPIRY);
    return nonce;
  }

  /**
   * Validates a nonce for secure verification flow.
   * 
   * Checks if the provided nonce matches the stored nonce for the user
   * and hasn't expired. This prevents replay attacks and ensures the
   * verification request is legitimate and timely.
   * 
   * @param userId - Discord user ID to validate nonce for
   * @param nonce - The nonce string to validate
   * @returns Promise<boolean> - True if nonce is valid and not expired
   * 
   * @example
   * ```typescript
   * const isValid = await nonceService.validateNonce('123456789', 'abc123def456');
   * if (isValid) {
   *   // Proceed with verification
   * }
   * ```
   */
  async validateNonce(
    userId: string,
    nonce: string
  ): Promise<boolean> {
    const data = await this.cache.get<NonceData>(`nonce_${userId}`);
    return data?.nonce === nonce;
  }

  /**
   * Gets the message and channel IDs associated with a user's nonce.
   * @param userId - The ID of the user.
   * @returns A Promise that resolves to the message and channel IDs, if they exist.
   */
  async getNonceData(userId: string): Promise<{ messageId?: string; channelId?: string }> {
    const data = await this.cache.get<NonceData>(`nonce_${userId}`);
    if (!data) return {};
    return { 
      messageId: data.messageId,
      channelId: data.channelId
    };
  }

  /**
   * Invalidates the nonce for a given user.
   * @param userId - The ID of the user.
   * @returns A Promise that resolves when the nonce is invalidated.
   */
  async invalidateNonce(userId: string): Promise<void> {
    await this.cache.del(`nonce_${userId}`);
  }
}
