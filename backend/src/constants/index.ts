/**
 * Application-wide constants
 * 
 * Centralized configuration values used throughout the application.
 * Provides default values and consistent configuration for various services.
 * 
 * Categories:
 * - Discord: Bot initialization and API timeouts
 * - Security: Rate limiting and nonce expiration
 * - Database: Connection and query timeouts
 */
export const CONSTANTS = {
  // Discord configuration
  DISCORD_INITIALIZATION_TIMEOUT: 10000, // 10 seconds - timeout for Discord bot initialization
  
  // Nonce and verification security  
  DEFAULT_NONCE_EXPIRY: 300000, // 5 minutes - default expiration for verification nonces
  
  // Rate limiting configuration for API endpoints
  RATE_LIMIT: {
    SHORT: {
      TTL: 1000,  // 1 second window
      LIMIT: 3,   // 3 requests maximum
    },
    MEDIUM: {
      TTL: 10000, // 10 second window  
      LIMIT: 20,  // 20 requests maximum
    },
    LONG: {
      TTL: 60000, // 1 minute window
      LIMIT: 100, // 100 requests
    },
  },
} as const;
