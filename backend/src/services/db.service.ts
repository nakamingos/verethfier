import { Injectable, Logger } from '@nestjs/common';

import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

// Use specific environment variables for DB Service
const supabaseUrl = process.env.DB_SUPABASE_URL;
const supabaseKey = process.env.DB_SUPABASE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('DB_SUPABASE_URL and DB_SUPABASE_KEY must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

import { VerifierRole } from '@/models/verifier-role.interface';

@Injectable()
export class DbService {

  async addUpdateServer(
    serverId: string, 
    serverName: string,
    roleId: string
  ): Promise<any> {

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

    // Debug logging to help troubleshoot rule creation
    Logger.debug('Inserting rule into database:', {
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
    });

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

    Logger.debug(`Logged user role: ${userId} -> ${roleId} in ${serverId}`, {
      user_name: userName,
      server_name: serverName,
      role_name: roleName,
      address: address?.toLowerCase()
    });
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
  async getLegacyRoles(serverId: string): Promise<{ data: Array<{ role_id: string, name: string }>, error: any }> {
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
}

// create table
//   public.verifier_users (
//     id bigint generated by default as identity,
//     user_id text not null,
//     servers jsonb not null default '{}'::jsonb,
//     constraint verifier_users_pkey primary key (id, user_id)
//   ) tablespace pg_default;