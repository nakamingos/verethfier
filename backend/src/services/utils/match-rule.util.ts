import { VerificationRule, Asset } from '@/models/verification-rule.interface';

/**
 * Rule matching utility for verification system.
 * 
 * Determines if a verification rule matches against a user's assets and context.
 * Supports multiple matching criteria including slug, channel, attributes, and minimum quantities.
 * 
 * @param rule - The verification rule to match against (supports partial rules for flexibility)
 * @param assets - Array of user's assets with attributes
 * @param channelId - Optional Discord channel ID for channel-specific rules
 * @returns boolean - True if the rule matches the given assets and context
 */
export function matchRule(
  rule: Partial<VerificationRule>,
  assets: Asset[],
  channelId?: string
): boolean {
  // Slug matching: Wildcard support for 'ALL' or empty strings
  // Allows rules to match all collections or specific collection slugs
  const slugMatch =
    !rule.slug ||
    rule.slug === '' ||
    rule.slug === 'ALL' ||
    assets.some((a) => a.slug === rule.slug);

  // Channel matching: Null/undefined channel_id means rule applies to all channels
  // Otherwise must match the specific channel ID
  const channelMatch =
    rule.channel_id == null /* null or undefined */ ||
    rule.channel_id === channelId;

  // Attribute matching: Only enforced when both key and value are specified
  // Supports case-insensitive matching for attribute values
  let attrMatch = true;
  const key = rule.attribute_key;
  const val = rule.attribute_value;
  if (key && key !== '' && val && val !== '') {
    attrMatch = assets.some(
      (a) => a.attributes?.[key]?.toString().toLowerCase() === val.toString().toLowerCase()
    );
  }

  // Minimum items matching: Ensures user owns enough assets to meet the threshold
  // Only enforced when min_items is specified and greater than 0
  let minItemsMatch = true;
  if (rule.min_items != null && rule.min_items > 0) {
    minItemsMatch = assets.length >= rule.min_items;
  }

  // All criteria must match for the rule to be satisfied
  return slugMatch && channelMatch && attrMatch && minItemsMatch;
}