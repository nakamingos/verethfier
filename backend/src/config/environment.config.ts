import dotenv from 'dotenv';

// Load environment variables once at startup
dotenv.config();

/**
 * Centralized environment configuration
 * Validates and caches environment variables to prevent repeated access
 */
export class EnvironmentConfig {
  // Discord Configuration
  public static readonly DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  public static readonly DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  public static readonly DISCORD_ENABLED = Number(process.env.DISCORD) || 0;
  
  // Database Configuration
  public static readonly DATA_SUPABASE_URL = process.env.DATA_SUPABASE_URL;
  public static readonly DATA_SUPABASE_ANON_KEY = process.env.DATA_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  public static readonly DB_SUPABASE_URL = process.env.DB_SUPABASE_URL;
  public static readonly DB_SUPABASE_KEY = process.env.DB_SUPABASE_KEY || process.env.SUPABASE_KEY;
  
  // Application Configuration
  public static readonly BASE_URL = process.env.BASE_URL;
  public static readonly NODE_ENV = process.env.NODE_ENV;
  public static readonly NONCE_EXPIRY = Number(process.env.NONCE_EXPIRY) || 300000; // 5 minutes default
  
  // Runtime flags
  public static readonly IS_TEST = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  
  /**
   * Validate required environment variables
   * Call this during application startup
   */
  public static validate(): void {
    const requiredVars = [
      { name: 'DATA_SUPABASE_URL', value: this.DATA_SUPABASE_URL },
      { name: 'DATA_SUPABASE_ANON_KEY', value: this.DATA_SUPABASE_ANON_KEY },
      { name: 'DB_SUPABASE_URL', value: this.DB_SUPABASE_URL },
      { name: 'DB_SUPABASE_KEY', value: this.DB_SUPABASE_KEY },
    ];

    const missing = requiredVars.filter(v => !v.value);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.map(v => v.name).join(', ')}`);
    }

    // Warn about optional Discord variables if Discord is enabled
    if (this.DISCORD_ENABLED && (!this.DISCORD_BOT_TOKEN || !this.DISCORD_CLIENT_ID)) {
      console.warn('Discord is enabled but DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID is missing');
    }
  }
}
