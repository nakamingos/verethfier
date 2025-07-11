import { Injectable, Logger, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CONSTANTS } from '@/constants';
import { DbResult, ServerRecord, LegacyRoleRecord } from '@/models/db.interface';
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
  private readonly logger = new Logger(DbService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient
  ) {}

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

    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    let { data: userData, error: fetchError } = await this.supabase
      .from('verifier_users')
      .select('servers')
      .eq('user_id', userId);
  
    if (fetchError) throw fetchError;
  
    const servers = userData[0]?.servers || {};
    servers[serverId] = role;
  
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

    let query = this.supabase
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

    const { data, error } = await this.supabase
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
    let query = this.supabase
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
    const { data, error: fetchError } = await this.supabase
      .from('verifier_rules')
      .select('server_id')
      .eq('id', ruleId);
    if (fetchError) throw fetchError;
    if (!data || data.length === 0 || data[0].server_id !== serverId) {
      throw new Error('Rule does not belong to this server');
    }
    const { error } = await this.supabase
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
    const { error } = await this.supabase
      .from('verifier_user_roles')
      .insert({
        user_id: userId,
        server_id: serverId,
        role_id: roleId,
        address: address?.toLowerCase(),
        verified_at: new Date().toISOString(),
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

  // Get all verification rules for a server (unified approach - no legacy table queries)
  async getAllRulesForServer(serverId: string): Promise<any[]> {
    const { data: rules, error } = await this.supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId);
    if (error) throw error;
    return rules || [];
  }

  // Legacy method maintained for backwards compatibility - now uses unified approach
  async getAllRulesWithLegacy(serverId: string): Promise<any[]> {
    return await this.getAllRulesForServer(serverId);
  }

  // Legacy methods maintained for backwards compatibility but simplified
  // Note: These methods now work with the unified verifier_rules table only
  async removeAllLegacyRoles(serverId: string): Promise<{ removed: Array<{ role_id: string, name: string }> }> {
    // In the unified system, "legacy" rules are identified by special slug/attributes
    const { data: legacyRules, error } = await this.supabase
      .from('verifier_rules')
      .select('role_id, role_name')
      .eq('server_id', serverId)
      .eq('slug', 'legacy_collection');
    
    if (error) throw error;
    if (!legacyRules || legacyRules.length === 0) {
      return { removed: [] };
    }

    // Remove legacy rules
    await this.supabase
      .from('verifier_rules')
      .delete()
      .eq('server_id', serverId)
      .eq('slug', 'legacy_collection');

    return { 
      removed: legacyRules.map(rule => ({ 
        role_id: rule.role_id, 
        name: rule.role_name || 'Legacy Role' 
      }))
    };
  }

  // Get all legacy rules for a server (now using unified table)
  async getLegacyRoles(serverId: string): Promise<DbResult<LegacyRoleRecord[]>> {
    const { data, error } = await this.supabase
      .from('verifier_rules')
      .select('role_id, role_name')
      .eq('server_id', serverId)
      .eq('slug', 'legacy_collection');
    
    // Transform to match expected legacy format
    const transformedData = data?.map(rule => ({
      role_id: rule.role_id,
      name: rule.role_name || 'Legacy Role'
    })) || [];

    return { data: transformedData, error };
  }

  // Check if a rule already exists for server, channel, role, and slug
  async ruleExists(serverId: string, channelId: string, roleId: string, slug: string): Promise<boolean> {
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { error } = await this.supabase
      .from('verifier_rules')
      .update({ message_id: messageId })
      .eq('id', ruleId);
    if (error) throw error;
  }

  /**
   * Finds a rule by message_id for a given guild and channel.
   */
  async findRuleByMessageId(guildId: string, channelId: string, messageId: string): Promise<VerifierRole | null> {
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

    const { data, error } = await this.supabase
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

    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    ruleId: string | null;
    address: string;
    userName?: string;
    serverName?: string;
    roleName?: string;
    expiresInHours?: number;
  }): Promise<any> {
    const expirationDate = assignment.expiresInHours 
      ? new Date(Date.now() + assignment.expiresInHours * 60 * 60 * 1000)
      : null;

    const { data, error } = await this.supabase
      .from('verifier_user_roles')
      .insert({
        user_id: assignment.userId,
        server_id: assignment.serverId,
        role_id: assignment.roleId,
        rule_id: assignment.ruleId,
        address: assignment.address.toLowerCase(),
        user_name: assignment.userName || '',
        server_name: assignment.serverName || '',
        role_name: assignment.roleName || '',
        expires_at: expirationDate,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      // Check if it's a unique constraint violation
      if (error.message && error.message.includes('duplicate key value violates unique constraint')) {
        Logger.debug('Role assignment already exists in database - this is expected during concurrent verifications');
        // Return a mock successful response for duplicate key violations
        return { id: 'duplicate', ...assignment };
      } else {
        Logger.error('Error tracking role assignment:', error);
        throw error;
      }
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

    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    let query = this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
   * Check if the unified verification system is properly set up
   * (Replaces legacy table existence checking)
   */
  async checkVerificationSystemReady(): Promise<boolean> {
    try {
      // Check if both core tables exist and are accessible
      const [rulesCheck, rolesCheck] = await Promise.all([
        this.supabase.from('verifier_rules').select('id').limit(1),
        this.supabase.from('verifier_user_roles').select('id').limit(1)
      ]);

      return !rulesCheck.error && !rolesCheck.error;
    } catch (e) {
      return false;
    }
  }

  /**
   * @deprecated Use checkVerificationSystemReady() instead
   */
  async checkEnhancedTrackingExists(): Promise<boolean> {
    return await this.checkVerificationSystemReady();
  }

  /**
   * Get user role assignment history for a specific server
   */
  async getUserRoleHistory(userId: string, serverId?: string): Promise<any[]> {
    let query = this.supabase
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
    const { data: roleData, error: roleError } = await this.supabase
      .from('verifier_user_roles')
      .select('address')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!roleError && roleData && roleData.length > 0) {
      return roleData[0].address;
    }

    // Fallback to verifier_users table for backward compatibility
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { data, error } = await this.supabase
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
    const { count, error } = await this.supabase
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
    const { count, error } = await this.supabase
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

    const { count, error } = await this.supabase
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
    const { data, error } = await this.supabase
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

  /**
   * Restores a deleted rule with its original ID and data.
   * This is used when undoing rule removals to maintain ID consistency.
   * 
   * @param ruleData - The complete rule data including the original ID
   * @returns Promise resolving to the restored rule or null on error
   * @throws Error if database operation fails
   */
  async restoreRuleWithOriginalId(ruleData: any): Promise<any> {
    this.logger.log(`Attempting to restore rule with ID: ${ruleData.id}`);
    
    // Use meaningful defaults instead of NULLs for better database constraints
    const finalSlug = ruleData.slug || 'ALL';
    const finalAttrKey = ruleData.attribute_key || 'ALL';
    const finalAttrVal = ruleData.attribute_value || 'ALL';
    const finalMinItems = ruleData.min_items != null ? ruleData.min_items : 1;

    // First, check if a rule with this ID already exists
    this.logger.log(`Checking if rule with ID ${ruleData.id} already exists...`);
    const { data: existingRule, error: checkError } = await this.supabase
      .from('verifier_rules')
      .select('id')
      .eq('id', ruleData.id)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 means no rows found
      this.logger.error(`Error checking for existing rule: ${checkError.message}`);
      throw checkError;
    }

    // If a rule with this ID already exists, create a new rule instead
    if (existingRule) {
      this.logger.log(`Rule with ID ${ruleData.id} already exists, creating new rule instead`);
      return this.addRoleMapping(
        ruleData.server_id,
        ruleData.server_name,
        ruleData.channel_id,
        ruleData.channel_name,
        finalSlug,
        ruleData.role_id,
        ruleData.role_name,
        finalAttrKey,
        finalAttrVal,
        finalMinItems
      );
    }

    // Otherwise, restore with the original ID
    this.logger.log(`No ID conflict, restoring rule with original ID ${ruleData.id}`);
    const { data, error } = await this.supabase
      .from('verifier_rules')
      .insert({
        id: ruleData.id, // Preserve the original ID
        server_id: ruleData.server_id,
        server_name: ruleData.server_name,
        channel_id: ruleData.channel_id,
        channel_name: ruleData.channel_name,
        slug: finalSlug,
        role_id: ruleData.role_id,
        role_name: ruleData.role_name,
        attribute_key: finalAttrKey,
        attribute_value: finalAttrVal,
        min_items: finalMinItems
        // Note: created_at will be set to current time by database
        // This is intentional as we want to track when the rule was restored
      })
      .select()
      .single();
    
    if (error) {
      this.logger.error(`Error inserting rule with original ID: ${error.message}`);
      throw error;
    }
    
    this.logger.log(`Successfully restored rule with ID: ${data.id}`);
    return data;
  }

  /**
   * Check if a role already has a rule with different criteria
   */
  async checkForDuplicateRole(
    serverId: string,
    roleId: string,
    channelId: string,
    slug: string,
    attributeKey: string,
    attributeValue: string,
    minItems: number
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('verifier_rules')
      .select('*')
      .eq('server_id', serverId)
      .eq('role_id', roleId);

    if (error) throw error;

    if (data && data.length > 0) {
      // Check if any existing rule for this role has different criteria
      const existingRule = data.find(rule => 
        rule.channel_id !== channelId ||
        rule.slug !== slug ||
        rule.attribute_key !== attributeKey ||
        rule.attribute_value !== attributeValue ||
        rule.min_items !== minItems
      );
      
      return existingRule || null;
    }

    return null;
  }

}