-- Drop the existing unique constraint
ALTER TABLE verifier_rules DROP CONSTRAINT IF EXISTS verifier_rules_unique_rule;
ALTER TABLE verifier_rules DROP CONSTRAINT IF EXISTS verifier_roles_server_id_channel_id_role_id_slug_attribute_key_attribute_value_key;

-- Create a unique partial index that treats NULL values properly
-- This prevents duplicate rules while allowing multiple NULL combinations
CREATE UNIQUE INDEX verifier_rules_unique_rule_with_nulls 
ON verifier_rules (
  server_id, 
  channel_id, 
  role_id, 
  COALESCE(slug, 'NULL'), 
  COALESCE(attribute_key, 'NULL'), 
  COALESCE(attribute_value, 'NULL'), 
  COALESCE(min_items, -1)
);
