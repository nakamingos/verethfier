import { Injectable, Logger } from '@nestjs/common';

import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://kcbuycbhynlmsrvoegzp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

@Injectable()
export class DataService {
  
  async checkAssetOwnership(address: string): Promise<any> {
    address = address.toLowerCase();
    const marketAddress = '0xd3418772623be1a3cc6b6d45cb46420cedd9154a'.toLowerCase();

    let query = supabase
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
    const { data, error } = await supabase
      .from('ethscriptions')
      .select('slug')
      .eq('owner', address.toLowerCase());
    if (error) throw new Error(error.message);
    return Array.from(new Set((data || []).map(r => r.slug)));
  }

  async getDetailedAssets(address: string): Promise<AssetWithAttrs[]> {
    const { data, error } = await supabase
      .from('ethscriptions')
      .select(`
        slug,
        attributes(values)
      `)
      .eq('owner', address.toLowerCase());

    if (error) {
      throw new Error(`Failed to fetch detailed assets: ${error.message}`);
    }

    return (data ?? []).map(row => ({
      slug: row.slug,
      attributes: (row.attributes?.[0]?.values as Record<string, string | number>) || {},
    }));
  }

  async getAllSlugs(): Promise<string[]> {
    const { data, error } = await supabase
      .from('collections')
      .select('slug');
    if (error) throw new Error(error.message);
    const slugs = Array.from(new Set((data || []).map(r => r.slug)));
    return ['all-collections', ...slugs];
  }

  /**
   * Check asset ownership with specific criteria (slug, attributes, minimum count)
   * 
   * @param address - Wallet address to check
   * @param slug - Collection slug to filter by (optional) 
   * @param attributeKey - Attribute key to filter by (optional)
   * @param attributeValue - Attribute value to filter by (optional)
   * @param minItems - Minimum required assets (minimum 1, even if 0 is passed)
   * @returns Number of matching assets, or 0 if requirements not met
   */
  async checkAssetOwnershipWithCriteria(
    address: string,
    slug?: string,
    attributeKey?: string,
    attributeValue?: string,
    minItems: number = 1
  ): Promise<number> {
    // Ensure minimum 1 asset is always required (prevent min_items = 0 bypass)
    const effectiveMinItems = Math.max(minItems, 1);
    
    address = address.toLowerCase();
    const marketAddress = '0xd3418772623be1a3cc6b6d45cb46420cedd9154a'.toLowerCase();

    let query = supabase
      .from('ethscriptions')
      .select('hashId, owner, prevOwner, slug')
      .or(`owner.eq.${address},and(owner.eq.${marketAddress},prevOwner.eq.${address})`);

    // Filter by slug if specified (skip filtering for 'ALL' which means any collection)
    if (slug && slug !== 'ALL' && slug !== 'all-collections') {
      query = query.eq('slug', slug);
    }

    const { data, error } = await query;
      
    if (error) {
      throw new Error(error.message);
    }

    // If no attribute filtering needed, just check count
    if (!attributeKey || !attributeValue || attributeKey === '' || attributeValue === '') {
      return data.length >= effectiveMinItems ? data.length : 0;
    }

    // For attribute filtering, we need to join with attributes table and filter by JSONB
    const attributeQuery = supabase
      .from('ethscriptions')
      .select(`
        hashId,
        attributes!inner(values)
      `)
      .or(`owner.eq.${address},and(owner.eq.${marketAddress},prevOwner.eq.${address})`)
      .eq(`attributes.values->>${attributeKey}`, attributeValue);

    // Add slug filter to attribute query if specified
    if (slug && slug !== 'ALL' && slug !== 'all-collections') {
      attributeQuery.eq('slug', slug);
    }

    const { data: attributeData, error: attributeError } = await attributeQuery;

    if (attributeError) {
      throw new Error(attributeError.message);
    }

    const matchingCount = attributeData?.length || 0;
    return matchingCount >= effectiveMinItems ? matchingCount : 0;
  }
}

export type AssetWithAttrs = {
  slug: string;
  attributes: Record<string, string | number>;
};
