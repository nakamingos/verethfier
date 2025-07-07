import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { CONSTANTS } from '@/constants';
import { DbResult, ServerRecord, LegacyRoleRecord } from '@/models/db.interface';

// Load environment variables
dotenv.config();

// Use specific environment variables for DB Service
const supabaseUrl = process.env.DB_SUPABASE_URL;
const supabaseKey = process.env.DB_SUPABASE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('DB_SUPABASE_URL and DB_SUPABASE_KEY must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

import { VerifierRole } from '@/models/verifier-role.interface';

/**
 * Database Service
 * 
 * This service provides data access layer for the verification system using Supabase.
 * It handles:
 * - Server and user management
 * - Verification rule CRUD operations
 * - Legacy role management and migration
 * - Asset verification tracking
 * 
 * Database Schema:
 * - verifier_servers: Discord server information
 * - verifier_users: User verification data
 * - verifier_roles: Verification rules configuration
 * - verification_queue: Pending verifications
 * 
 * @example
 * ```typescript
 * // Add or update a server
 * await dbService.addUpdateServer('123456789', 'My Server', 'role123');
 * 
 * // Get verification rules
 * const rules = await dbService.getVerificationRules('123456789', 'channel123');
 * ```
 */
@Injectable()
export class DbService {

  /**
   * Adds or updates a Discord server in the database.
   * 
   * Uses upsert operation to either create new server record or update existing one.
   * This is typically called when the bot joins a new server or when server
   * configuration changes.
   * 
   * @param serverId - Discord server (guild) ID
   * @param serverName - Human-readable server name
   * @param roleId - Default role ID for this server
   * @returns Promise resolving to the server record or null on error
   * @throws Error if database operation fails
   */
  async addUpdateServer(
    serverId: string, 
    serverName: string,
    roleId: string
  ): Promise<DbResult<ServerRecord> | null> {

    const { data, error } = await supabase
      .from('verifier_servers')
      .upsert({
        id: serverId,
        name: serverName,
        role_id: roleId
      });

    if (error) throw error;
    return data;
  }
  
  /**
   * Retrieves user data for a specific Discord user.
   * 
   * Returns user verification history and associated server data.
   * Used for user verification status checks and history tracking.
   * 
   * @param userId - Discord user ID
   * @returns Promise resolving to user data object or null if not found
   * @throws Error if database query fails
   */
  async getUserServers(userId: string): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_users')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data[0];
  }

  async addServerToUser(
    userId: string, 
    serverId: string, 
    role: string,
    address: string
  ) {
  
    // Step 1: Retrieve the current user data with the servers JSONB object
    let { data: userData, error: fetchError } = await supabase
      .from('verifier_users')
      .select('servers')
      .eq('user_id', userId);
  
    if (fetchError) throw fetchError;
  
    const servers = userData[0]?.servers || {};
    servers[serverId] = role;
  
    const { data, error } = await supabase
      .from('verifier_users')
      .upsert({
        user_id: userId,
        address: address?.toLowerCase(),
        servers: servers
      }, {
        onConflict: 'user_id'
      });
  
    if (error) throw error;
    return data;
  }  

  async getServerRole(serverId: string): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_servers')
      .select('role_id')
      .eq('id', serverId);

    if (error) throw error;
    return data[0]?.role_id;
  }

  // New methods for v2:
  
  /**
   * Check if a rule with the same criteria already exists for a different role
   */
  async checkForDuplicateRule(
    serverId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    excludeRoleId?: string
  ): Promise<any> {
    // Use the same defaults as addRoleMapping for consistent comparison
    const finalSlug = slug || 'ALL';
    const finalAttrKey = attributeKey || 'ALL';
    const finalAttrVal = attributeValue || 'ALL';
    const finalMinItems = minItems != null ? minItems : 1;

    let query = supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId)
      .eq('channel_id', channelId)
      .eq('slug', finalSlug)
      .eq('attribute_key', finalAttrKey)
      .eq('attribute_value', finalAttrVal)
      .eq('min_items', finalMinItems);

    // Exclude the current role if we're checking for updates
    if (excludeRoleId) {
      query = query.neq('role_id', excludeRoleId);
    }

    const { data, error } = await query;

    if (error) {
      Logger.error('Error checking for duplicate rules:', error);
      throw error;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  async addRoleMapping(
    serverId: string,
    serverName: string,
    channelId: string,
    channelName: string,
    slug: string,
    roleId: string,
    roleName: string,
    attrKey: string,
    attrVal: string,
    minItems: number
  ): Promise<any> {
    // Use meaningful defaults instead of NULLs for better database constraints
    const finalSlug = slug || 'ALL';
    const finalAttrKey = attrKey || 'ALL';
    const finalAttrVal = attrVal || 'ALL';
    const finalMinItems = minItems != null ? minItems : 1;

    const { data, error } = await supabase
      .from('verifier_rules')
      .insert({
        server_id: serverId,
        server_name: serverName,
        channel_id: channelId,
        channel_name: channelName,
        slug: finalSlug,
        role_id: roleId,
        role_name: roleName,
        attribute_key: finalAttrKey,
        attribute_value: finalAttrVal,
        min_items: finalMinItems
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async getRoleMappings(serverId: string, channelId?: string): Promise<any[]> {
    let query = supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId);
    if (channelId) {
      query = query.eq('channel_id', channelId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async deleteRoleMapping(ruleId: string, serverId: string): Promise<void> {
    // Only delete if rule belongs to this server
    const { data, error: fetchError } = await supabase
      .from('verifier_rules')
      .select('server_id')
      .eq('id', ruleId);
    if (fetchError) throw fetchError;
    if (!data || data.length === 0 || data[0].server_id !== serverId) {
      throw new Error('Rule does not belong to this server');
    }
    const { error } = await supabase
      .from('verifier_rules')
      .delete()
      .eq('id', ruleId)
      .eq('server_id', serverId);
    if (error) throw error;
  }

  async logUserRole(
    userId: string, 
    serverId: string, 
    roleId: string, 
    address: string,
    userName?: string,
    serverName?: string,
    roleName?: string
  ): Promise<void> {
    const { error } = await supabase
      .from('verifier_user_roles')
      .insert({
        user_id: userId,
        server_id: serverId,
        role_id: roleId,
        address: address?.toLowerCase(),
        assigned_at: new Date().toISOString(),
        user_name: userName || null,
        server_name: serverName || null,
        role_name: roleName || null
      });

    if (error) {
      Logger.error('Error logging user role:', error);
      throw error;
    }

    // Role assignment logged successfully
  }

  // Returns both new rules and legacy role (if present) for a server
  async getAllRulesWithLegacy(serverId: string): Promise<any[]> {
    // Get new rules (all channels)
    const { data: rules, error: rulesError } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId);
    if (rulesError) throw rulesError;

    // Get legacy role (if any)
    const { data: legacy, error: legacyError } = await supabase
      .from('verifier_servers')
      .select('role_id, name')
      .eq('id', serverId);
    if (legacyError) throw legacyError;

    // If legacy role exists, add as a pseudo-rule with LEGACY marker
    let all = [...rules];
    if (legacy && legacy[0]?.role_id) {
      all.push({
        id: 'LEGACY',
        channel_id: '-',
        role_id: legacy[0].role_id,
        slug: null,
        attribute_key: null,
        attribute_value: null,
        min_items: null,
        legacy: true,
        server_name: legacy[0].name,
      });
    }
    return all;
  }

  // Remove all legacy roles for a guild (by guild/server id)
  async removeAllLegacyRoles(serverId: string): Promise<{ removed: Array<{ role_id: string, name: string }> }> {
    const { data: legacyRoles, error } = await supabase
      .from('verifier_servers')
      .select('role_id, name')
      .eq('id', serverId);
    if (error) throw error;
    if (!legacyRoles || legacyRoles.length === 0) {
      return { removed: [] };
    }
    await supabase
      .from('verifier_servers')
      .delete()
      .eq('id', serverId);
    return { removed: legacyRoles };
  }

  // Get all legacy roles for a guild (by guild/server id)
  async getLegacyRoles(serverId: string): Promise<DbResult<LegacyRoleRecord[]>> {
    const { data, error } = await supabase
      .from('verifier_servers')
      .select('role_id, name')
      .eq('id', serverId);
    return { data, error };
  }

  // Check if a rule already exists for server, channel, role, and slug
  async ruleExists(serverId: string, channelId: string, roleId: string, slug: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('id')
      .eq('server_id', serverId)
      .eq('channel_id', channelId)
      .eq('role_id', roleId)
      .eq('slug', slug);
    if (error) throw error;
    return !!(data && data.length > 0);
  }

  /**
   * Finds the first rule with a non-null message_id for a given guild and channel.
   */
  async findRuleWithMessage(guildId: string, channelId: string): Promise<VerifierRole | null> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', guildId)
      .eq('channel_id', channelId)
      .not('message_id', 'is', null)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] as VerifierRole : null;
  }

  /**
   * Updates the message_id for a specific rule.
   */
  async updateRuleMessageId(ruleId: number, messageId: string): Promise<void> {
    const { error } = await supabase
      .from('verifier_rules')
      .update({ message_id: messageId })
      .eq('id', ruleId);
    if (error) throw error;
  }

  /**
   * Finds a rule by message_id for a given guild and channel.
   */
  async findRuleByMessageId(guildId: string, channelId: string, messageId: string): Promise<VerifierRole | null> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', guildId)
      .eq('channel_id', channelId)
      .eq('message_id', messageId)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] as VerifierRole : null;
  }

  /**
   * Finds ALL rules by message_id for a given guild and channel.
   * This supports multiple roles being assigned for the same verification criteria.
   */
  async findRulesByMessageId(guildId: string, channelId: string, messageId: string): Promise<VerifierRole[]> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', guildId)
      .eq('channel_id', channelId)
      .eq('message_id', messageId);
    if (error) throw error;
    return (data || []) as VerifierRole[];
  }

  /**
   * Gets all rules for a specific channel in a guild.
   */
  async getRulesByChannel(guildId: string, channelId: string): Promise<VerifierRole[]> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', guildId)
      .eq('channel_id', channelId);
    if (error) throw error;
    return data || [];
  }

  async findConflictingRule(
    serverId: string,
    channelId: string,
    roleId: string,
    slug: string,
    attrKey: string,
    attrVal: string,
    minItems: number
  ): Promise<any> {
    // Use the same defaults as addRoleMapping for consistent conflict detection
    const finalSlug = slug || 'ALL';
    const finalAttrKey = attrKey || 'ALL';
    const finalAttrVal = attrVal || 'ALL';
    const finalMinItems = minItems != null ? minItems : 1;

    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId)
      .eq('channel_id', channelId)
      .eq('role_id', roleId)
      .eq('slug', finalSlug)
      .eq('attribute_key', finalAttrKey)
      .eq('attribute_value', finalAttrVal)
      .eq('min_items', finalMinItems)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }
    return data;
  }

  async checkForExactDuplicateRule(
    serverId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number,
    roleId: string
  ): Promise<any> {
    // Use the same defaults as addRoleMapping for consistent comparison
    const finalSlug = slug || 'ALL';
    const finalAttrKey = attributeKey || 'ALL';
    const finalAttrVal = attributeValue || 'ALL';
    const finalMinItems = minItems != null ? minItems : 1;

    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId)
      .eq('channel_id', channelId)
      .eq('slug', finalSlug)
      .eq('attribute_key', finalAttrKey)
      .eq('attribute_value', finalAttrVal)
      .eq('min_items', finalMinItems)
      .eq('role_id', roleId);

    if (error) {
      Logger.error('Error checking for exact duplicate rules:', error);
      throw error;
    }

    return data && data.length > 0 ? data[0] : null;
  }

  // =======================================
  // DYNAMIC ROLE MANAGEMENT METHODS
  // =======================================

  /**
   * Get all active role assignments that need periodic re-verification
   */
  async getActiveRoleAssignments(): Promise<any[]> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select(`
        *,
        verifier_rules!inner(*)
      `)
      .eq('status', 'active')
      .order('last_checked', { ascending: true }); // Oldest checks first

    if (error) {
      Logger.error('Error fetching active role assignments:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get a specific verification rule by ID
   */
  async getRuleById(ruleId: string): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .select('*')
      .eq('id', ruleId)
      .single();

    if (error) {
      Logger.error(`Error fetching rule ${ruleId}:`, error);
      throw error;
    }

    return data;
  }

  /**
   * Track a new role assignment in the enhanced tracking table
   */
  async trackRoleAssignment(assignment: {
    userId: string;
    serverId: string;
    roleId: string;
    ruleId: string;
    address: string;
    userName?: string;
    serverName?: string;
    roleName?: string;
    expiresInHours?: number;
  }): Promise<any> {
    const expirationDate = assignment.expiresInHours 
      ? new Date(Date.now() + assignment.expiresInHours * 60 * 60 * 1000)
      : null;

    const { data, error } = await supabase
      .from('verifier_user_roles')
      .insert({
        user_id: assignment.userId,
        server_id: assignment.serverId,
        role_id: assignment.roleId,
        rule_id: assignment.ruleId,
        address: assignment.address.toLowerCase(),
        user_name: assignment.userName,
        server_name: assignment.serverName,
        role_name: assignment.roleName,
        verification_expires_at: expirationDate,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      Logger.error('Error tracking role assignment:', error);
      throw error;
    }

    return data;
  }

  /**
   * Update the verification status and timestamp for a role assignment
   */
  async updateRoleVerification(assignmentId: string, stillValid: boolean): Promise<any> {
    const updates: any = {
      last_checked: new Date().toISOString()
    };

    if (!stillValid) {
      updates.status = 'expired';
    }

    const { data, error } = await supabase
      .from('verifier_user_roles')
      .update(updates)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      Logger.error('Error updating role verification:', error);
      throw error;
    }

    return data;
  }

  /**
   * Revoke a role assignment (mark as revoked)
   */
  async revokeRoleAssignment(assignmentId: string): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .update({
        status: 'revoked',
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      Logger.error('Error revoking role assignment:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get role assignments for a specific user in a server
   */
  async getUserRoleAssignments(userId: string, serverId?: string): Promise<any[]> {
    let query = supabase
      .from('verifier_user_roles')
      .select(`
        *,
        verifier_rules!inner(*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active');

    if (serverId) {
      query = query.eq('server_id', serverId);
    }

    const { data, error } = await query;

    if (error) {
      Logger.error('Error fetching user role assignments:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get active assignments for a specific user
   */
  async getUserActiveAssignments(userId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select(`
        *,
        verifier_rules:rule_id (*)
      `)
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) {
      Logger.error('Error fetching user active assignments:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get active assignments for a specific rule
   */
  async getRuleActiveAssignments(ruleId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select('*')
      .eq('rule_id', ruleId)
      .eq('status', 'active');

    if (error) {
      Logger.error('Error fetching rule active assignments:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get statistics about role assignments for monitoring
   */
  async getRoleAssignmentStats(): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select('status, server_id, role_id')
      .order('status');

    if (error) {
      Logger.error('Error fetching role assignment stats:', error);
      throw error;
    }

    const stats = {
      total: data?.length || 0,
      active: data?.filter(r => r.status === 'active').length || 0,
      expired: data?.filter(r => r.status === 'expired').length || 0,
      revoked: data?.filter(r => r.status === 'revoked').length || 0,
      byServer: {} as Record<string, number>
    };

    // Count by server
    data?.forEach(assignment => {
      if (assignment.status === 'active') {
        stats.byServer[assignment.server_id] = (stats.byServer[assignment.server_id] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Check if enhanced role tracking table exists
   */
  async checkEnhancedTrackingExists(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('verifier_user_roles')
        .select('id')
        .limit(1);

      return !error;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get user role assignment history for a specific server
   */
  async getUserRoleHistory(userId: string, serverId?: string): Promise<any[]> {
    let query = supabase
      .from('verifier_user_roles')
      .select(`
        *,
        verifier_rules!inner(*)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (serverId) {
      query = query.eq('server_id', serverId);
    }

    const { data, error } = await query;

    if (error) {
      Logger.error('Error fetching user role history:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * Get user's latest verified address
   * Uses the address from the most recent role assignment to avoid joins
   */
  async getUserLatestAddress(userId: string): Promise<string | null> {
    // First try to get the most recent address from role assignments
    const { data: roleData, error: roleError } = await supabase
      .from('verifier_user_roles')
      .select('address')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!roleError && roleData && roleData.length > 0) {
      return roleData[0].address;
    }

    // Fallback to verifier_users table for backward compatibility
    const { data, error } = await supabase
      .from('verifier_users')
      .select('address')
      .eq('user_id', userId)
      .single();

    if (error) {
      Logger.debug(`No address found for user ${userId}:`, error.message);
      return null;
    }

    return data?.address || null;
  }

  /**
   * Get all unique users who have role assignments in a server
   */
  async getServerUniqueUsers(serverId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select('user_id')
      .eq('server_id', serverId)
      .eq('status', 'active');

    if (error) {
      Logger.error('Error fetching server users:', error);
      throw error;
    }

    // Return unique user IDs
    const uniqueUsers = [...new Set(data?.map(row => row.user_id) || [])];
    return uniqueUsers;
  }

  /**
   * Update role assignment status by assignment ID
   */
  async updateRoleAssignmentStatus(assignmentId: string, status: 'active' | 'expired' | 'revoked'): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      Logger.error('Error updating role assignment status:', error);
      throw error;
    }

    return data;
  }

  /**
   * Update last verified timestamp for an assignment
   */
  async updateLastVerified(assignmentId: string): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .update({
        last_checked: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) {
      Logger.error('Error updating last verified:', error);
      throw error;
    }

    return data;
  }

  /**
   * Count assignments by status
   */
  async countActiveAssignments(): Promise<number> {
    const { count, error } = await supabase
      .from('verifier_user_roles')
      .select('*', { count: 'exact' })
      .eq('status', 'active');

    if (error) {
      Logger.error('Error counting active assignments:', error);
      throw error;
    }

    return count || 0;
  }

  async countRevokedAssignments(): Promise<number> {
    const { count, error } = await supabase
      .from('verifier_user_roles')
      .select('*', { count: 'exact' })
      .eq('status', 'revoked');

    if (error) {
      Logger.error('Error counting revoked assignments:', error);
      throw error;
    }

    return count || 0;
  }

  async countExpiringSoonAssignments(hoursFromNow: number = 24): Promise<number> {
    const expiryThreshold = new Date();
    expiryThreshold.setHours(expiryThreshold.getHours() + hoursFromNow);

    const { count, error } = await supabase
      .from('verifier_user_roles')
      .select('*', { count: 'exact' })
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .lte('expires_at', expiryThreshold.toISOString());

    if (error) {
      Logger.error('Error counting expiring assignments:', error);
      throw error;
    }

    return count || 0;
  }

  /**
   * Get the last time re-verification was run
   */
  async getLastReverificationTime(): Promise<Date | null> {
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .select('last_checked')
      .order('last_checked', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      Logger.debug('No re-verification time found:', error.message);
      return null;
    }

    return data?.last_checked ? new Date(data.last_checked) : null;
  }

}

// create table
//   public.verifier_users (
//     id bigint generated by default as identity,
//     user_id text not null,
//     servers jsonb not null default '{}'::jsonb,
//     constraint verifier_users_pkey primary key (id, user_id)
//   ) tablespace pg_default;