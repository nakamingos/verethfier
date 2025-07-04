-- Drop the existing unique constraint
ALTER TABLE verifier_rules DROP CONSTRAINT IF EXISTS verifier_roles_server_id_channel_id_role_id_slug_attribute_key_attribute_value_key;

-- Add the corrected unique constraint that includes min_items
ALTER TABLE verifier_rules ADD CONSTRAINT verifier_rules_unique_rule 
UNIQUE (server_id, channel_id, role_id, slug, attribute_key, attribute_value, min_items);
