import { VerificationRule, Asset } from '@/models/verification-rule.interface';

/**
 * Utility for matching a rule against assets and channelId
 */
export function matchRule(
  rule: Partial<VerificationRule>,
  assets: Asset[],
  channelId?: string
): boolean {
  // slug wildcard: empty string or 'ALL'
  const slugMatch =
    !rule.slug ||
    rule.slug === '' ||
    rule.slug === 'ALL' ||
    assets.some((a) => a.slug === rule.slug);

  // channel wildcard: null/undefined ⇒ true, otherwise must equal
  const channelMatch =
    rule.channel_id == null /* null or undefined */ ||
    rule.channel_id === channelId;

  // trait match: only enforced if both attribute_key+attribute_value set (case-insensitive)
  let attrMatch = true;
  const key = rule.attribute_key;
  const val = rule.attribute_value;
  if (key && key !== '' && val && val !== '') {
    attrMatch = assets.some(
      (a) => a.attributes?.[key]?.toString().toLowerCase() === val.toString().toLowerCase()
    );
  }

  // min_items: if specified and > 0
  let minItemsMatch = true;
  if (rule.min_items != null && rule.min_items > 0) {
    minItemsMatch = assets.length >= rule.min_items;
  }

  return slugMatch && channelMatch && attrMatch && minItemsMatch;
}