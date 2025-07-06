// Application-wide constants
export const CONSTANTS = {
  // Discord
  DISCORD_INITIALIZATION_TIMEOUT: 10000, // 10 seconds
  
  // Nonce
  DEFAULT_NONCE_EXPIRY: 300000, // 5 minutes
  
  // Security
  RATE_LIMIT: {
    SHORT: {
      TTL: 1000,  // 1 second
      LIMIT: 3,   // 3 requests
    },
    MEDIUM: {
      TTL: 10000, // 10 seconds  
      LIMIT: 20,  // 20 requests
    },
    LONG: {
      TTL: 60000, // 1 minute
      LIMIT: 100, // 100 requests
    },
  },
} as const;
