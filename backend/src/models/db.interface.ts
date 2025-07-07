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

/**
 * Enhanced user role record interface
 * 
 * Represents a role assignment in the enhanced verifier_user_roles table.
 * Includes all tracking information for dynamic role management.
 */
export interface UserRoleRecord {
  id: string;                        // Unique assignment ID
  user_id: string;                   // Discord user ID
  server_id: string;                 // Discord server/guild ID
  role_id: string;                   // Discord role ID
  rule_id?: string;                  // Associated verification rule ID (null for legacy)
  address: string;                   // Wallet address (denormalized for performance)
  user_name?: string;                // Discord username (cached)
  server_name?: string;              // Discord server name (cached)
  role_name?: string;                // Discord role name (cached)
  message_id?: string;               // Original verification message ID (null for legacy)
  status: 'active' | 'expired' | 'revoked';  // Assignment status
  verified_at: string;               // ISO timestamp of role verification
  last_checked?: string;             // ISO timestamp of last verification check
  expires_at?: string;               // ISO timestamp when verification expires
  created_at: string;                // ISO timestamp of record creation
  updated_at: string;                // ISO timestamp of last record update
}
