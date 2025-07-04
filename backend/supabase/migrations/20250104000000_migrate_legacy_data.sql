-- Migration script: Extract rules from legacy jsonb format to relational structure
-- This migrates existing data from verifier_users.servers jsonb to verifier_rules table

DO $$
DECLARE
    user_record RECORD;
    server_record RECORD;
    rule_data JSONB;
BEGIN
    -- Only run if there's legacy data to migrate
    IF EXISTS (
        SELECT 1 FROM verifier_users 
        WHERE servers != '{}'::jsonb 
        AND jsonb_typeof(servers) = 'object'
    ) THEN
        
        -- Loop through users with server data
        FOR user_record IN 
            SELECT user_id, servers 
            FROM verifier_users 
            WHERE servers != '{}'::jsonb
        LOOP
            -- Extract server rules from jsonb
            FOR server_record IN 
                SELECT 
                    key as server_id,
                    value as server_data
                FROM jsonb_each(user_record.servers)
            LOOP
                -- Extract rule data from server_data
                rule_data := server_record.server_data;
                
                -- Insert rule into verifier_rules table
                -- Note: This creates a basic rule from legacy data
                -- You may need to adjust based on your legacy jsonb structure
                INSERT INTO verifier_rules (
                    server_id,
                    server_name,
                    channel_id,
                    channel_name,
                    role_id,
                    slug,
                    attribute_key,
                    attribute_value,
                    min_items,
                    created_at
                ) VALUES (
                    server_record.server_id,
                    COALESCE(rule_data->>'server_name', ''),
                    rule_data->>'channel_id',
                    COALESCE(rule_data->>'channel_name', ''),
                    COALESCE(rule_data->>'role_id', ''),
                    COALESCE(rule_data->>'slug', 'ALL'),
                    COALESCE(rule_data->>'attribute_key', ''),
                    COALESCE(rule_data->>'attribute_value', ''),
                    COALESCE((rule_data->>'min_items')::bigint, 0),
                    now()
                )
                ON CONFLICT (server_id, channel_id, role_id, slug, attribute_key, attribute_value, min_items) 
                DO NOTHING; -- Skip duplicates
                
            END LOOP;
        END LOOP;
        
        -- Clear the legacy jsonb data after migration
        -- Uncomment the next line if you want to clear legacy data after migration
        -- UPDATE verifier_users SET servers = '{}'::jsonb;
        
    END IF;
END $$;
