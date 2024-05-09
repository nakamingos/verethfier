import { Inject, Injectable } from '@nestjs/common';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import dotenv from 'dotenv';
dotenv.config();

const TTL = Number(process.env.NONCE_EXPIRY);

@Injectable()
export class NonceService {

  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache
  ) {}

  /**
   * Creates a nonce for the specified user ID and stores it in the cache.
   * @param userId The ID of the user for whom the nonce is being created.
   * @returns The generated nonce.
   */
  public async createNonce(userId: string): Promise<string> {
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    await this.cache.set(`nonce_${userId}`, nonce, TTL);
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
    const storedNonce = await this.cache.get<string>(`nonce_${userId}`);
    return storedNonce === nonce;
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
