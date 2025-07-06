/**
 * Interface for verification rules
 */
export interface VerificationRule {
  role_id: string;
  slug: string;
  attribute_key: string;
  attribute_value: string;
  min_items: number | null;
  channel_id?: string | null; // Optional for partial/temporary rules
}

/**
 * Interface for asset objects used in rule matching
 */
export interface Asset {
  slug?: string;
  attributes?: Record<string, any>;
  [key: string]: any; // Additional asset properties
}
