import { Injectable } from '@nestjs/common';
import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './db.service';

const TTL = Number(process.env.NONCE_EXPIRY); // milliseconds

@Injectable()
export class NonceService {
  /** Create or overwrite the user’s nonce row */
  async createNonce(userId: string): Promise<string> {
    const nonce =
      Math.random().toString(36).slice(2, 15) +
      Math.random().toString(36).slice(2, 15);
    const expires = new Date(Date.now() + TTL).toISOString();

    const { error } = await supabase
      .from('verifier_nonces')          // ← updated table name
      .upsert(
        { user_id: userId, nonce, expires },
        { onConflict: 'user_id' }
      );

    if (error) throw new Error(`Nonce write failed: ${error.message}`);
    return nonce;
  }

  /** Validate & immediately delete the row so it can’t be replayed */
  async validateNonce(userId: string, incoming: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('verifier_nonces')          // ← updated table name
      .select('nonce, expires')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[NonceService] lookup error:', error.message);
      return false;
    }
    if (!data) {
      console.log('[NonceService] no nonce row for', userId);
      return false;
    }

    const { nonce: stored, expires } = data as {
      nonce: string;
      expires: string;
    };
    if (stored !== incoming || new Date(expires) < new Date()) {
      return false;
    }

    // delete so it can’t be used again
    await supabase
      .from('verifier_nonces')        // ← updated table name
      .delete()
      .eq('user_id', userId);

    return true;
  }

  /** Optional: revoke early if you need to */
  async invalidateNonce(userId: string): Promise<void> {
    await supabase
      .from('verifier_nonces')        // ← updated table name
      .delete()
      .eq('user_id', userId);
  }
}
