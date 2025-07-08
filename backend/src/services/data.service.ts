import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { EnvironmentConfig } from '@/config/environment.config';

// Validate environment on service load
EnvironmentConfig.validate();

const supabase = createClient(
  EnvironmentConfig.DATA_SUPABASE_URL!, 
  EnvironmentConfig.DATA_SUPABASE_ANON_KEY!
);

/**
 * DataService
 * 
 * Handles all data operations related to asset ownership verification.
 * Connects to the data Supabase instance to query ethscriptions and metadata.
 * 
 * Key responsibilities:
 * - Check asset ownership for verification
 * - Query assets with specific attributes and criteria
 * - Support slug-based and attribute-based filtering
 * - Handle marketplace escrow scenarios
 */
@Injectable()
export class DataService {
  
  /**
   * Checks basic asset ownership for an address.
   * Includes assets in marketplace escrow (owned by market but previously owned by address).
   * 
   * @param address - The wallet address to check ownership for
   * @returns Promise<number> - Count of assets owned by the address
   */
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

  /**
   * Gets unique slugs of assets owned by an address.
   * 
   * @param address - The wallet address to check
   * @returns Promise<string[]> - Array of unique slug names owned
   */
  async getOwnedSlugs(address: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('ethscriptions')
      .select('slug')
      .eq('owner', address.toLowerCase());
    if (error) throw new Error(error.message);
    return Array.from(new Set((data || []).map(r => r.slug)));
  }

  /**
   * Gets detailed asset information including metadata attributes.
   * Combines ethscriptions data with metadata for comprehensive asset details.
   * 
   * @param address - The wallet address to get assets for
   * @returns Promise<AssetWithAttrs[]> - Array of assets with their attributes
   */
  async getDetailedAssets(address: string): Promise<AssetWithAttrs[]> {
    // Step 1: Get ethscriptions owned by the address
    const { data: ethscriptions, error } = await supabase
      .from('ethscriptions')
      .select('hashId, slug, sha')
      .eq('owner', address.toLowerCase());

    if (error) {
      throw new Error(`Failed to fetch ethscriptions: ${error.message}`);
    }

    if (!ethscriptions || ethscriptions.length === 0) {
      return [];
    }

    // Step 2: Get attributes for these ethscriptions using their sha values
    const ethscriptionShas = ethscriptions.map(e => e.sha).filter(sha => sha); // Filter out null/undefined
    const { data: attributes, error: attrError } = await supabase
      .from('attributes_new')
      .select('sha, values')
      .in('sha', ethscriptionShas);

    if (attrError) {
      throw new Error(`Failed to fetch attributes: ${attrError.message}`);
    }

    // Step 3: Combine the data
    return ethscriptions.map(ethscription => {
      const attr = attributes?.find(a => a.sha === ethscription.sha);
      return {
        slug: ethscription.slug,
        attributes: (attr?.values as Record<string, string | number>) || {},
      };
    });
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
    const normalizedAddress = address.toLowerCase();
    const marketAddress = '0xd3418772623be1a3cc6b6d45cb46420cedd9154a';
    
    Logger.debug(`Checking ownership: ${normalizedAddress.slice(0,6)}...${normalizedAddress.slice(-4)}, slug=${slug}, attr=${attributeKey}=${attributeValue}, minItems=${minItems}`);

    // Early return for simple ownership check (no attribute filtering)
    const hasAttributeFilter = attributeKey && attributeKey !== 'ALL' && attributeValue && attributeValue !== 'ALL';
    
    if (!hasAttributeFilter) {
      let query = supabase
        .from('ethscriptions')
        .select('hashId, owner, prevOwner, slug')
        .or(`owner.eq.${normalizedAddress},and(owner.eq.${marketAddress},prevOwner.eq.${normalizedAddress})`);

      // Filter by slug if specified
      if (slug && slug !== 'ALL' && slug !== 'all-collections') {
        query = query.eq('slug', slug);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }
      
      return data.length >= minItems ? data.length : 0;
    }

    // For attribute filtering, use optimized JOIN query
    let joinQuery = supabase
      .from('ethscriptions')
      .select(`
        hashId, 
        owner, 
        prevOwner, 
        slug, 
        sha,
        attributes_new!inner(sha, values)
      `)
      .or(`owner.eq.${normalizedAddress},and(owner.eq.${marketAddress},prevOwner.eq.${normalizedAddress})`);

    // Filter by slug if specified
    if (slug && slug !== 'ALL' && slug !== 'all-collections') {
      joinQuery = joinQuery.eq('slug', slug);
    }

    const { data: joinedData, error: joinError } = await joinQuery;

    if (joinError) {
      throw new Error(`Failed to query with join: ${joinError.message}`);
    }

    if (!joinedData || joinedData.length === 0) {
      Logger.debug(`No ethscriptions found with attributes for user`);
      return 0;
    }

    // Optimized attribute filtering
    const matchingItems = this.filterByAttributes(joinedData, attributeKey, attributeValue);
    const matchingCount = matchingItems.length;
    
    Logger.debug(`Found ${matchingCount} matching ethscriptions with ${attributeKey}=${attributeValue}`);
    
    return matchingCount >= minItems ? matchingCount : 0;
  }

  /**
   * Filter ethscriptions by attribute key/value with optimized logic
   * @private
   */
  private filterByAttributes(ethscriptions: any[], attributeKey: string, attributeValue?: string): any[] {
    if (attributeKey === 'ALL') {
      // Search all attribute keys for the specified value
      return ethscriptions.filter(item => {
        const attrs = item.attributes_new?.values;
        if (!attrs) return false;
        
        return Object.values(attrs).some(value => 
          value && value.toString().toLowerCase() === attributeValue?.toLowerCase()
        );
      });
    }

    // Generate possible key variations once
    const keyVariations = [
      attributeKey,
      attributeKey.charAt(0).toUpperCase() + attributeKey.slice(1).toLowerCase(),
      attributeKey.toLowerCase(),
      attributeKey.toUpperCase()
    ];

    // Try each key variation until we find matches
    for (const keyVariation of keyVariations) {
      const matches = ethscriptions.filter(item => {
        const attrs = item.attributes_new?.values;
        if (!attrs || !attrs.hasOwnProperty(keyVariation)) return false;
        
        // If no specific value required, just having the key is enough
        if (!attributeValue || attributeValue === 'ALL') {
          return true;
        }
        
        // Check for specific value match (case-insensitive)
        const value = attrs[keyVariation];
        return value && value.toString().toLowerCase() === attributeValue.toLowerCase();
      });

      if (matches.length > 0) {
        Logger.debug(`Found ${matches.length} matches using key variation: "${keyVariation}"`);
        return matches;
      }
    }

    return [];
  }
}

export type AssetWithAttrs = {
  slug: string;
  attributes: Record<string, string | number>;
};
