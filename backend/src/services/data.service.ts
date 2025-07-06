import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Use specific environment variables for Data Service
const supabaseUrl = process.env.DATA_SUPABASE_URL;
const supabaseKey = process.env.DATA_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('DATA_SUPABASE_URL and DATA_SUPABASE_ANON_KEY must be set in environment variables');
}

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
    // Use the actual minItems value (allow 0 if that's what the rule specifies)
    const effectiveMinItems = minItems;
    
    // Add debug logging
    Logger.log(`checkAssetOwnershipWithCriteria: address=${address}, slug=${slug}, attr=${attributeKey}=${attributeValue}, minItems=${minItems}, effectiveMinItems=${effectiveMinItems}`);
    
    address = address.toLowerCase();
    const marketAddress = '0xd3418772623be1a3cc6b6d45cb46420cedd9154a'.toLowerCase();

    // If no attribute filtering needed, use simple query
    // Only skip attribute filtering if BOTH key and value are 'ALL' or empty
    if ((!attributeKey || attributeKey === '' || attributeKey === 'ALL') && 
        (!attributeValue || attributeValue === '' || attributeValue === 'ALL')) {
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
      
      return data.length >= effectiveMinItems ? data.length : 0;
    }

    // For attribute filtering, use a direct JOIN since there's a relationship on sha
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
      .or(`owner.eq.${address},and(owner.eq.${marketAddress},prevOwner.eq.${address})`);

    // Filter by slug if specified
    if (slug && slug !== 'ALL' && slug !== 'all-collections') {
      joinQuery = joinQuery.eq('slug', slug);
    }

    const { data: joinedData, error: joinError } = await joinQuery;

    if (joinError) {
      throw new Error(`Failed to query with join: ${joinError.message}`);
    }

    if (!joinedData || joinedData.length === 0) {
      Logger.log(`No ethscriptions found with attributes for user`);
      return 0;
    }

    // Filter by attribute key/value (case-insensitive)
    let matchingItems = [];
    let usedKey = attributeKey;

    if (attributeKey === 'ALL') {
      // Special case: search all attribute keys for the specified value
      matchingItems = joinedData.filter(item => {
        const attrs = item.attributes_new;
        if (!attrs || !attrs.values) return false;
        
        // Search through all attribute keys for the specified value (case-insensitive)
        return Object.values(attrs.values).some(value => 
          value && value.toString().toLowerCase() === attributeValue.toLowerCase()
        );
      });
    } else {
      // Original logic for specific attribute key
      const possibleKeys = [
        attributeKey,
        attributeKey.charAt(0).toUpperCase() + attributeKey.slice(1).toLowerCase(),
        attributeKey.toLowerCase(),
        attributeKey.toUpperCase()
      ];

      for (const keyVariation of possibleKeys) {
      const matches = joinedData.filter(item => {
        const attrs = item.attributes_new;
        if (!attrs || !attrs.values) return false;
        
        // Check if the attribute key exists
        const hasKey = attrs.values.hasOwnProperty(keyVariation);
        if (!hasKey) return false;
        
        // If no specific value is required (attributeValue is empty/null/'ALL'), 
        // just having the key is enough
        if (!attributeValue || attributeValue === '' || attributeValue === 'ALL') {
          return true;
        }
        
        // Otherwise, check for specific value match
        const value = attrs.values[keyVariation];
        return value && value.toLowerCase() === attributeValue.toLowerCase();
      });

      if (matches.length > 0) {
        matchingItems = matches;
        usedKey = keyVariation;
        const matchType = (!attributeValue || attributeValue === '' || attributeValue === 'ALL') ? 'any value' : `value: "${attributeValue}"`;
        Logger.log(`Found ${matches.length} matches using key variation: "${keyVariation}" (${matchType})`);
        break;
      }
    }
    } // Close the else block

    const matchingCount = matchingItems.length;
    
    // Debug logging
    const valueCondition = (!attributeValue || attributeValue === '' || attributeValue === 'ALL') ? 'any value' : `'${attributeValue}'`;
    Logger.log(`Attribute filtering: found ${matchingCount} matching ethscriptions with ${usedKey}=${valueCondition}`);
    Logger.log(`User owns ${joinedData.length} total ${slug || 'ethscriptions'} with attributes`);
    
    if (joinedData.length > 0 && matchingCount === 0) {
      const searchCondition = (!attributeValue || attributeValue === '' || attributeValue === 'ALL') ? 
        `attribute key "${attributeKey}"` : 
        `${attributeKey}='${attributeValue}'`;
      Logger.log(`User's ethscriptions have attributes but none match ${searchCondition}`);
      
      // Show what attributes the user actually has
      const userAttrs = joinedData.slice(0, 3).map(item => ({
        sha: item.sha,
        attributes: item.attributes_new?.values || {}
      }));
      Logger.log(`User's asset attributes (first few):`, userAttrs);
      
      // Check if user has the attribute key but different value (only relevant if we were looking for a specific value)
      if (attributeValue && attributeValue !== '' && attributeValue !== 'ALL') {
        const userWithKey = joinedData.filter(item => {
          const attrs = item.attributes_new;
          if (!attrs || !attrs.values) return false;
          
          return Object.keys(attrs.values).some(key => 
            key.toLowerCase() === attributeKey.toLowerCase()
          );
        });
        
        if (userWithKey.length > 0) {
          Logger.log(`User has "${attributeKey}" attribute but with different values:`, 
            userWithKey.slice(0, 3).map(item => {
              const attrs = item.attributes_new;
              const matchingKey = Object.keys(attrs.values).find(key => 
                key.toLowerCase() === attributeKey.toLowerCase()
              );
              return { sha: item.sha, [matchingKey]: attrs.values[matchingKey] };
            })
          );
        } else {
          Logger.log(`User does not have any "${attributeKey}" attribute`);
        }
      } else {
        // If we were looking for any value of the attribute key, show what other keys the user has
        Logger.log(`User does not have any "${attributeKey}" attribute`);
      }
    }
    
    return matchingCount >= effectiveMinItems ? matchingCount : 0;
  }
}

export type AssetWithAttrs = {
  slug: string;
  attributes: Record<string, string | number>;
};
