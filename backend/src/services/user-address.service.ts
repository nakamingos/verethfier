import { Injectable, Logger, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';

interface UserWallet {
  id: number;
  user_id: string;
  address: string;
  user_name: string | null;
  created_at: string;
  last_verified_at: string;
}

interface AddAddressResult {
  success: boolean;
  wallet?: UserWallet;
  error?: string;
  isNewAddress?: boolean;
}

interface UserAddressSummary {
  user_id: string;
  addresses: string[];
  total_addresses: number;
  last_verified_at?: string;
}

@Injectable()
export class UserAddressService {
  private readonly logger = new Logger(UserAddressService.name);

  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient
  ) {}

  /**
   * Get all addresses for a specific user
   */
  async getUserAddresses(userId: string): Promise<string[]> {
    try {
      this.logger.debug(`Getting addresses for user: ${userId}`);
      
      const { data, error } = await this.supabase
        .from('user_wallets')
        .select('address')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.error(`Error fetching addresses for user ${userId}:`, error);
        return [];
      }

      const addresses = data?.map(row => row.address) || [];
      this.logger.debug(`Found ${addresses.length} addresses for user ${userId}`);
      
      return addresses;
    } catch (error) {
      this.logger.error(`Exception getting addresses for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Add a new address for a user (after successful verification)
   */
  async addUserAddress(userId: string, address: string, userName?: string | null): Promise<AddAddressResult> {
    try {
      const normalizedAddress = address.toLowerCase();
      this.logger.debug(`Adding address ${normalizedAddress} for user: ${userId}${userName ? ` (${userName})` : ''}`);

      // Check if this user-address combination already exists
      const { data: existing } = await this.supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('address', normalizedAddress)
        .single();

      if (existing) {
        // Update last_verified_at and user_name for existing address
        const { data: updated, error: updateError } = await this.supabase
          .from('user_wallets')
          .update({ 
            last_verified_at: new Date().toISOString(),
            user_name: userName !== undefined ? userName : existing.user_name
          })
          .eq('user_id', userId)
          .eq('address', normalizedAddress)
          .select()
          .single();

        if (updateError) {
          this.logger.error(`Error updating existing address:`, updateError);
          return { success: false, error: updateError.message };
        }

        this.logger.debug(`Updated existing address verification time and username`);
        return { 
          success: true, 
          wallet: updated, 
          isNewAddress: false 
        };
      }

      // Insert new address
      const { data: newWallet, error: insertError } = await this.supabase
        .from('user_wallets')
        .insert({
          user_id: userId,
          address: normalizedAddress,
          user_name: userName || null,
          created_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        this.logger.error(`Error inserting new address:`, insertError);
        return { success: false, error: insertError.message };
      }

      this.logger.log(`Successfully added new address ${normalizedAddress} for user ${userId}`);
      return { 
        success: true, 
        wallet: newWallet, 
        isNewAddress: true 
      };

    } catch (error) {
      this.logger.error(`Exception adding address for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove an address from a user's wallet collection
   */
  async removeUserAddress(userId: string, address: string): Promise<boolean> {
    try {
      const normalizedAddress = address.toLowerCase();
      this.logger.debug(`Removing address ${normalizedAddress} for user: ${userId}`);

      const { error } = await this.supabase
        .from('user_wallets')
        .delete()
        .eq('user_id', userId)
        .eq('address', normalizedAddress);

      if (error) {
        this.logger.error(`Error removing address:`, error);
        return false;
      }

      this.logger.log(`Successfully removed address ${normalizedAddress} for user ${userId}`);
      return true;

    } catch (error) {
      this.logger.error(`Exception removing address for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get summary of all user addresses with counts
   */
  async getUserAddressSummary(userId: string): Promise<UserAddressSummary | null> {
    try {
      this.logger.debug(`Getting address summary for user: ${userId}`);

      const { data, error } = await this.supabase
        .from('user_wallets')
        .select('address, last_verified_at')
        .eq('user_id', userId)
        .order('last_verified_at', { ascending: false });

      if (error) {
        this.logger.error(`Error fetching address summary:`, error);
        return null;
      }

      if (!data || data.length === 0) {
        return {
          user_id: userId,
          addresses: [],
          total_addresses: 0
        };
      }

      return {
        user_id: userId,
        addresses: data.map(row => row.address),
        total_addresses: data.length,
        last_verified_at: data[0]?.last_verified_at
      };

    } catch (error) {
      this.logger.error(`Exception getting address summary for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Check if a user has any addresses
   */
  async userHasAddresses(userId: string): Promise<boolean> {
    try {
      const addresses = await this.getUserAddresses(userId);
      return addresses.length > 0;
    } catch (error) {
      this.logger.error(`Exception checking if user has addresses:`, error);
      return false;
    }
  }

  /**
   * Get all users who have a specific address
   */
  async getUsersWithAddress(address: string): Promise<string[]> {
    try {
      const normalizedAddress = address.toLowerCase();
      this.logger.debug(`Finding users with address: ${normalizedAddress}`);

      const { data, error } = await this.supabase
        .from('user_wallets')
        .select('user_id')
        .eq('address', normalizedAddress);

      if (error) {
        this.logger.error(`Error finding users with address:`, error);
        return [];
      }

      const userIds = data?.map(row => row.user_id) || [];
      this.logger.debug(`Found ${userIds.length} users with address ${normalizedAddress}`);
      
      return userIds;
    } catch (error) {
      this.logger.error(`Exception finding users with address:`, error);
      return [];
    }
  }

  /**
   * Clean up old verification records (optional maintenance)
   */
  async cleanupOldVerifications(daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      this.logger.debug(`Cleaning up verifications older than ${cutoffDate.toISOString()}`);

      const { data, error } = await this.supabase
        .from('user_wallets')
        .delete()
        .lt('last_verified_at', cutoffDate.toISOString())
        .select('id');

      if (error) {
        this.logger.error(`Error during cleanup:`, error);
        return 0;
      }

      const deletedCount = data?.length || 0;
      this.logger.log(`Cleaned up ${deletedCount} old verification records`);
      
      return deletedCount;
    } catch (error) {
      this.logger.error(`Exception during cleanup:`, error);
      return 0;
    }
  }
}
