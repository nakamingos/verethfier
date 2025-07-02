import { Injectable } from '@nestjs/common';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://kcbuycbhynlmsrvoegzp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

@Injectable()
export class DataService {
  constructor(private readonly supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)) {}

  async checkAssetOwnership(address: string): Promise<any> {
    address = address.toLowerCase();
    const marketAddress = '0xd3418772623be1a3cc6b6d45cb46420cedd9154a'.toLowerCase();

    let query = this.supabase
      .from('ethscriptions')
      .select('hashId, owner, prevOwner')
      .or(`owner.eq.${address},and(owner.eq.${marketAddress},prevOwner.eq.${address})`);

    const { data, error } = await query;
      
    if (error) {
      throw new Error(error.message);
    }
    return data.length;
  }

  async getOwnedSlugs(address: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('ethscriptions')
      .select('slug')
      .eq('owner', address.toLowerCase());
    if (error) throw new Error(error.message);
    return Array.from(new Set((data || []).map(r => r.slug)));
  }

  async getDetailedAssets(address: string): Promise<AssetWithAttrs[]> {
    const { data, error } = await this.supabase
      .from('ethscriptions')
      .select('slug, values')
      .eq('owner', address.toLowerCase());

    if (error) {
      throw new Error(`Failed to fetch detailed assets: ${error.message}`);
    }

    return (data ?? []).map(row => ({
      slug: row.slug,
      attributes: row.values as Record<string, string | number>,
    }));
  }

  async getAllSlugs(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('collections')
      .select('slug');
    if (error) throw new Error(error.message);
    const slugs = Array.from(new Set((data || []).map(r => r.slug)));
    return slugs;
  }
}

export type AssetWithAttrs = {
  slug: string;
  attributes: Record<string, string | number>;
};
