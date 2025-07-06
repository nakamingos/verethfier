/**
 * Database interfaces for type safety and consistency
 * 
 * These interfaces define the structure of data returned from database operations
 * and provide type safety for database service methods.
 */

/**
 * Generic database operation result wrapper
 * 
 * Standard format for database operations that may succeed or fail.
 * Follows the Supabase client response pattern.
 * 
 * @template T - The type of data returned on success
 */
export interface DbResult<T = any> {
  data: T;     // The result data (null if error occurred)
  error: any;  // Error information (null if operation succeeded)
}

/**
 * Server record interface
 * 
 * Represents a Discord server entry in the database.
 * Used for legacy server verification configurations.
 */
export interface ServerRecord {
  id: string;        // Discord server/guild ID
  name: string;      // Discord server/guild name
  role_id: string;   // Default role ID for the server
}

/**
 * Legacy role record interface
 * 
 * Represents legacy role configuration data.
 * Used during migration from old to new verification system.
 */
export interface LegacyRoleRecord {
  role_id: string;   // Discord role ID
  name: string;      // Discord role name
}
