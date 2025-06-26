import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Instantiate Supabase client
const supabaseUrl = 'https://cpwubaszhjdtqlvfdlbx.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// Mapping interface
export interface Mapping {
  id: number;
  serverId: string;
  channelId: string;
  collectionSlug: string;
  roleId: string;
  createdAt: string;
}

@Injectable()
export class SettingsService {
  /**
   * Add or update a channel->role mapping for a specific collection
   */
  async addMapping(
    serverId: string,
    channelId: string,
    collectionSlug: string,
    roleId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('verifier_settings')
      .upsert(
        {
          server_id: serverId,
          channel_id: channelId,
          slug: collectionSlug,
          role_id: roleId,
        },
        { onConflict: 'server_id,channel_id,slug' },
      );
    if (error) throw error;
  }

  /**
   * Fetch the mapping for a given channel
   */
  async getMappingByChannel(channelId: string): Promise<Mapping | null> {
    const { data, error } = await supabase
      .from('verifier_settings')
      .select('*')
      .eq('channel_id', channelId)
      .limit(1);
    if (error) throw error;
    // Optionally map snake_case to camelCase here if you want
    return data && data.length > 0 ? {
      id: data[0].id,
      serverId: data[0].server_id,
      channelId: data[0].channel_id,
      collectionSlug: data[0].slug,
      roleId: data[0].role_id,
      createdAt: data[0].created_at,
    } as Mapping : null;
  }

  /**
   * List all mappings for a specific server
   */
  async listMappingsForServer(serverId: string): Promise<Mapping[]> {
    const { data, error } = await supabase
      .from('verifier_settings')
      .select('*')
      .eq('serverId', serverId);
    if (error) throw error;
    return (data || []) as Mapping[];
  }
}
