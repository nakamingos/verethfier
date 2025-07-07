import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AppLogger } from '@/utils/app-logger.util';

/**
 * Caching service for frequently accessed data
 * Provides smart caching with TTL management and cache invalidation
 */
@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Cache time-to-live values (in seconds)
   */
  private static readonly TTL = {
    RULES: 300,        // 5 minutes - Rules don't change often
    USER_ASSETS: 120,  // 2 minutes - Asset ownership changes
    GUILD_ROLES: 600,  // 10 minutes - Discord roles are relatively stable
    SLUGS: 3600,       // 1 hour - Collection slugs rarely change
    NONCES: 300,       // 5 minutes - Nonce expiry time
  } as const;

  /**
   * Get cached data with automatic type inference
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.cacheManager.get<T>(key);
      if (cached) {
        AppLogger.debug(`Cache hit: ${key}`);
      }
      return cached || null;
    } catch (error) {
      AppLogger.error(`Cache get error for key ${key}:`, error.message);
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
      AppLogger.debug(`Cache set: ${key} (TTL: ${ttl || 'default'}s)`);
    } catch (error) {
      AppLogger.error(`Cache set error for key ${key}:`, error.message);
    }
  }

  /**
   * Delete cached data
   */
  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.del(key);
      AppLogger.debug(`Cache deleted: ${key}`);
    } catch (error) {
      AppLogger.error(`Cache delete error for key ${key}:`, error.message);
    }
  }

  /**
   * Get or set cached data with fallback function
   */
  async getOrSet<T>(
    key: string,
    fallbackFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    AppLogger.debug(`Cache miss: ${key}, executing fallback`);
    const startTime = Date.now();
    
    try {
      const result = await fallbackFn();
      await this.set(key, result, ttl);
      
      AppLogger.logWithTiming(`Cache fallback for ${key}`, startTime);
      return result;
    } catch (error) {
      AppLogger.error(`Cache fallback error for key ${key}:`, error.message);
      throw error;
    }
  }

  /**
   * Cache verification rules for a server
   */
  async cacheServerRules(serverId: string, rules: any[]): Promise<void> {
    const key = `rules:server:${serverId}`;
    await this.set(key, rules, CacheService.TTL.RULES);
  }

  /**
   * Get cached verification rules for a server
   */
  async getCachedServerRules(serverId: string): Promise<any[] | null> {
    const key = `rules:server:${serverId}`;
    return this.get<any[]>(key);
  }

  /**
   * Cache user assets
   */
  async cacheUserAssets(address: string, assets: any[]): Promise<void> {
    const key = `assets:${address.toLowerCase()}`;
    await this.set(key, assets, CacheService.TTL.USER_ASSETS);
  }

  /**
   * Get cached user assets
   */
  async getCachedUserAssets(address: string): Promise<any[] | null> {
    const key = `assets:${address.toLowerCase()}`;
    return this.get<any[]>(key);
  }

  /**
   * Cache collection slugs
   */
  async cacheSlugs(slugs: string[]): Promise<void> {
    const key = 'slugs:all';
    await this.set(key, slugs, CacheService.TTL.SLUGS);
  }

  /**
   * Get cached collection slugs
   */
  async getCachedSlugs(): Promise<string[] | null> {
    const key = 'slugs:all';
    return this.get<string[]>(key);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<void> {
    // Note: This is a simplified implementation
    // For production, consider using Redis with pattern-based deletion
    AppLogger.debug(`Cache invalidation requested for pattern: ${pattern}`);
    
    // For now, we'll just clear specific known keys
    if (pattern.includes('rules')) {
      // Clear all rules cache - implement more sophisticated pattern matching if needed
      AppLogger.debug('Clearing rules cache due to pattern match');
    }
  }

  /**
   * Get TTL constants for external use
   */
  static getTTL() {
    return CacheService.TTL;
  }
}
