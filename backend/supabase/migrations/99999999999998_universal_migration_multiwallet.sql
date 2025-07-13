-- =====================================================================================
-- Universal Database Migration - Multi-Wallet Enhanced
-- =====================================================================================
-- Complete schema for Verethfier Discord verification bot with multi-wallet support
-- This migration creates all necessary tables and constraints for a fresh installation
-- =====================================================================================

BEGIN;

DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Universal Migration (Multi-Wallet Enhanced) Starting...';
    RAISE NOTICE '=================================================================';
    
    -- =====================================================================================
    -- STEP 1: Create verifier_rules table
    -- =====================================================================================
    
    RAISE NOTICE 'Creating verifier_rules table...';
    
    CREATE TABLE IF NOT EXISTS public.verifier_rules (
        id BIGSERIAL PRIMARY KEY,
        channel_id TEXT NOT NULL,
        attribute TEXT NOT NULL,
        value TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        is_active BOOLEAN DEFAULT true,
        
        -- Ensure unique rules per channel
        UNIQUE(channel_id, attribute, value, role_id)
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_verifier_rules_channel_id ON verifier_rules(channel_id);
    CREATE INDEX IF NOT EXISTS idx_verifier_rules_attribute ON verifier_rules(attribute);
    CREATE INDEX IF NOT EXISTS idx_verifier_rules_active ON verifier_rules(is_active);
    CREATE INDEX IF NOT EXISTS idx_verifier_rules_lookup ON verifier_rules(channel_id, attribute, value) WHERE is_active = true;
    
    -- =====================================================================================
    -- STEP 2: Create user_wallets table (Multi-Wallet Support)
    -- =====================================================================================
    
    RAISE NOTICE 'Creating user_wallets table for multi-wallet support...';
    
    CREATE TABLE IF NOT EXISTS public.user_wallets (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        address TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_verified_at TIMESTAMPTZ DEFAULT NOW(),
        
        -- Constraints
        UNIQUE(user_id, address),
        CHECK(address ~ '^0x[a-fA-F0-9]{40}$') -- Valid Ethereum address format
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id ON user_wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(address);
    CREATE INDEX IF NOT EXISTS idx_user_wallets_last_verified ON user_wallets(last_verified_at);
    
    -- =====================================================================================
    -- STEP 3: Create verifier_user_roles table (without address column - uses user_wallets)
    -- =====================================================================================
    
    RAISE NOTICE 'Creating verifier_user_roles table...';
    
    CREATE TABLE IF NOT EXISTS public.verifier_user_roles (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        rule_id BIGINT REFERENCES verifier_rules(id) ON DELETE CASCADE,
        verified_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_checked TIMESTAMPTZ DEFAULT NOW(),
        
        -- Note: No address column - addresses are now tracked in user_wallets table
        -- Verification checks all addresses in user_wallets for this user_id
        
        -- Ensure unique user-channel-role combinations
        UNIQUE(user_id, channel_id, role_id)
    );
    
    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_verifier_user_roles_user_id ON verifier_user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_verifier_user_roles_channel_id ON verifier_user_roles(channel_id);
    CREATE INDEX IF NOT EXISTS idx_verifier_user_roles_role_id ON verifier_user_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_verifier_user_roles_lookup ON verifier_user_roles(user_id, channel_id);
    
    -- =====================================================================================
    -- STEP 4: Create legacy compatibility tables (if needed)
    -- =====================================================================================
    
    -- Legacy servers table (for backward compatibility)
    CREATE TABLE IF NOT EXISTS public.verifier_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Legacy users table (for backward compatibility) 
    CREATE TABLE IF NOT EXISTS public.verifier_users (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        servers JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- =====================================================================================
    -- STEP 5: Create functions for multi-wallet verification
    -- =====================================================================================
    
    RAISE NOTICE 'Creating multi-wallet verification functions...';
    
    -- Function to get all addresses for a user
    CREATE OR REPLACE FUNCTION get_user_addresses(p_user_id TEXT)
    RETURNS TABLE(address TEXT, last_verified_at TIMESTAMPTZ) AS $$
    BEGIN
        RETURN QUERY
        SELECT uw.address, uw.last_verified_at
        FROM user_wallets uw
        WHERE uw.user_id = p_user_id
        ORDER BY uw.last_verified_at DESC;
    END;
    $$ LANGUAGE plpgsql;
    
    -- Function to check if user has any verified addresses
    CREATE OR REPLACE FUNCTION user_has_addresses(p_user_id TEXT)
    RETURNS BOOLEAN AS $$
    BEGIN
        RETURN EXISTS (
            SELECT 1 FROM user_wallets 
            WHERE user_id = p_user_id
        );
    END;
    $$ LANGUAGE plpgsql;
    
    -- =====================================================================================
    -- STEP 6: Verification and Summary
    -- =====================================================================================
    
    DECLARE
        rules_count integer;
        user_roles_count integer;
        wallets_count integer;
        servers_count integer;
        users_count integer;
    BEGIN
        SELECT COUNT(*) INTO rules_count FROM verifier_rules;
        SELECT COUNT(*) INTO user_roles_count FROM verifier_user_roles;
        SELECT COUNT(*) INTO wallets_count FROM user_wallets;
        SELECT COUNT(*) INTO servers_count FROM verifier_servers;
        SELECT COUNT(*) INTO users_count FROM verifier_users;
        
        RAISE NOTICE '=================================================================';
        RAISE NOTICE 'Universal Migration (Multi-Wallet Enhanced) Summary:';
        RAISE NOTICE '- verifier_rules table: % records', rules_count;
        RAISE NOTICE '- verifier_user_roles table: % records', user_roles_count;
        RAISE NOTICE '- user_wallets table: % records', wallets_count;
        RAISE NOTICE '- verifier_servers table: % records', servers_count;
        RAISE NOTICE '- verifier_users table: % records', users_count;
        RAISE NOTICE '';
        RAISE NOTICE 'Multi-Wallet Features:';
        RAISE NOTICE '- ✅ user_wallets table created for multiple addresses per user';
        RAISE NOTICE '- ✅ verifier_user_roles table optimized (no address column needed)';
        RAISE NOTICE '- ✅ Helper functions created for multi-wallet verification';
        RAISE NOTICE '- ✅ Proper indexes and constraints established';
        RAISE NOTICE '=================================================================';
    END;
    
    RAISE NOTICE 'Universal migration (multi-wallet enhanced) completed successfully!';
    
END $$;

COMMIT;
