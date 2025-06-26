import { Injectable } from '@nestjs/common';
import { supabase } from './db.service';

const NONCE_EXPIRY_MS = Number(process.env.NONCE_EXPIRY);

interface NonceRow {
  nonce: string;
  expires: string;
}

@Injectable()
export class NonceService {
  /** Create or overwrite the user’s nonce row */
  async createNonce(userId: string): Promise<string> {
    const nonce = this.generateNonce();
    const expires = new Date(Date.now() + NONCE_EXPIRY_MS).toISOString();

    const { error } = await supabase
      .from('verifier_nonces')
      .upsert(
        { user_id: userId, nonce, expires },
        { onConflict: 'user_id' }
      );

    if (error) throw new Error(`Nonce write failed: ${error.message}`);
    return nonce;
  }

  /** Validate & immediately delete the row so it can’t be replayed */
  async validateNonce(userId: string, incomingNonce: string): Promise<boolean> {
    const { data: nonceRow, error } = await supabase
      .from('verifier_nonces')
      .select('nonce, expires')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) return false;
    if (!nonceRow) return false;

    if (!this.isNonceValid(nonceRow, incomingNonce)) {
      return false;
    }

    await this.deleteNonce(userId);
    return true;
  }

  /** Optional: revoke early if you need to */
  async invalidateNonce(userId: string): Promise<void> {
    await this.deleteNonce(userId);
  }

  // --- Private helpers ---

  private generateNonce(): string {
    return (
      Math.random().toString(36).slice(2, 15) +
      Math.random().toString(36).slice(2, 15)
    );
  }

  private isNonceValid(nonceRow: NonceRow, incomingNonce: string): boolean {
    const { nonce: storedNonce, expires } = nonceRow;
    return (
      storedNonce === incomingNonce &&
      new Date(expires) >= new Date()
    );
  }

  private async deleteNonce(userId: string): Promise<void> {
    await supabase
      .from('verifier_nonces')
      .delete()
      .eq('user_id', userId);
  }
}
