/**
 * Type definitions for improving type safety across the application
 */

// Cache service types
export interface CacheableRule {
  id: string | number;
  server_id: string;
  channel_id: string;
  role_id: string;
  slug: string;
  attribute_key?: string;
  attribute_value?: string;
  min_items?: number;
  created_at: string;
  updated_at: string;
}

export interface CacheableAsset {
  hashId: string;
  slug: string;
  owner: string;
  prevOwner?: string;
  attributes?: Record<string, string | number>;
}

// Error handling types
export interface ErrorResponse {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Security utility types
export type SensitiveDataMask = Record<string, unknown>;

// Data service types
export interface AssetOwnershipCriteria {
  address: string;
  slug?: string;
  attributeKey?: string;
  attributeValue?: string;
  minItems?: number;
}

export interface BulkAssetOwnershipCriteria {
  criteria: AssetOwnershipCriteria[];
}

export interface AssetOwnershipResult {
  address: string;
  criteria: AssetOwnershipCriteria;
  matchingAssets: number;
  isValid: boolean;
}
