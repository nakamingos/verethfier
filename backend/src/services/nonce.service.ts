import { Inject, Injectable } from '@nestjs/common';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import dotenv from 'dotenv';
dotenv.config();

const TTL = Number(process.env.NONCE_EXPIRY);

interface NonceData {
  nonce: string;
  messageId?: string;
  channelId?: string;
}

@Injectable()
export class NonceService {

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  /**
   * Creates a nonce for the specified user ID and stores it in the cache.
   * @param userId The ID of the user for whom the nonce is being created.
   * @param messageId Optional message ID associated with the verification
   * @param channelId Optional channel ID associated with the verification
   * @returns The generated nonce.
   */
  public async createNonce(
    userId: string, 
    messageId?: string, 
    channelId?: string
  ): Promise<string> {
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const data: NonceData = { nonce, messageId, channelId };
    await this.cache.set(`nonce_${userId}`, data, TTL);
    return nonce;
  }

  /**
   * Validates the nonce for a given user.
   * @param userId - The ID of the user.
   * @param nonce - The nonce to validate.
   * @returns A Promise that resolves to a boolean indicating whether the nonce is valid.
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
