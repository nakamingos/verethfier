import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cpwubaszhjdtqlvfdlbx.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY;
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

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
    const { data: mappingRows, error } = await supabase
      .from('verifier_settings')
      .select('*')
      .eq('channel_id', channelId)
      .limit(1);
    if (error) throw error;
    return mappingRows && mappingRows.length > 0
      ? this.mapDbRowToMapping(mappingRows[0])
      : null;
  }

  /**
   * List all mappings for a specific server
   */
  async listMappingsForServer(serverId: string): Promise<Mapping[]> {
    const { data: mappingRows, error } = await supabase
      .from('verifier_settings')
      .select('*')
      .eq('server_id', serverId);
    if (error) throw error;
    return (mappingRows || []).map(this.mapDbRowToMapping);
  }

  /**
   * Convert a DB row to Mapping interface
   */
  private mapDbRowToMapping = (row: Record<string, any>): Mapping => ({
    id: row.id,
    serverId: row.server_id,
    channelId: row.channel_id,
    collectionSlug: row.slug,
    roleId: row.role_id,
    createdAt: row.created_at,
  });
}
