import { Injectable } from '@nestjs/common';

import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://cpwubaszhjdtqlvfdlbx.supabase.co'; // 'https://gqccibjxbgyuclehqtmk.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  async addRoleMapping(
    serverId: string,
    serverName: string,
    channelId: string,
    slug: string,
    roleId: string,
    attrKey: string,
    attrVal: string,
    minItems: number
  ): Promise<any> {
    const { data, error } = await supabase
      .from('verifier_rules')
      .insert({
        server_id: serverId,
        server_name: serverName,
        channel_id: channelId,
        slug: slug,
        role_id: roleId,
        attribute_key: attrKey,
        attribute_value: attrVal,
        min_items: minItems
      });
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

  async logUserRole(userId: string, serverId: string, roleId: string, address: string): Promise<void> {
    const { error } = await supabase
      .from('verifier_user_roles')
      .insert({
        user_id: userId,
        server_id: serverId,
        role_id: roleId,
        address: address?.toLowerCase(),
        assigned_at: new Date().toISOString()
      });
    if (error) throw error;
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
}

// create table
//   public.verifier_users (
//     id bigint generated by default as identity,
//     user_id text not null,
//     servers jsonb not null default '{}'::jsonb,
//     constraint verifier_users_pkey primary key (id, user_id)
//   ) tablespace pg_default;