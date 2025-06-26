import { Injectable } from '@nestjs/common';

import { createClient } from '@supabase/supabase-js';

import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://kcbuycbhynlmsrvoegzp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

@Injectable()
export class DataService {
  
  async checkAssetOwnership(address: string, slug: string): Promise<number> {
    address = address.toLowerCase();
    let query = supabase
      .from('ethscriptions')
      .select('hashId', { count: 'exact' })
      .eq('slug', slug)
      .or(`owner.eq.${address},prevOwner.eq.${address}`);

    const { count, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return count || 0;
  }

}
