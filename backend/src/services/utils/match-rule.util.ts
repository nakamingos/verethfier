// Utility for matching a rule against assets and channelId
export function matchesRule(
  rule: any,
  assets: any[],
  channelId?: string
): boolean {
  // slug wildcard: null/undefined or 'ALL'
  const slugMatch =
    !rule.slug ||
    rule.slug === 'ALL' ||
    assets.some((a) => a.slug === rule.slug);

  // channel wildcard: null/undefined ⇒ true, otherwise must equal
  const channelMatch =
    rule.channel_id == null /* null or undefined */ ||
    rule.channel_id === channelId;

  // trait match: only enforced if both attribute_key+attribute_value set
  let attrMatch = true;
  const key = rule.attribute_key;
  const val = rule.attribute_value;
  if (key && val != null) {
    attrMatch = assets.some(
      (a) => a.attributes?.[key] == val
    );
  }

  // min_items: if specified…
  let minItemsMatch = true;
  if (rule.min_items != null) {
    // reject zero or negative
    if (rule.min_items < 1) {
      return false;
    }
    minItemsMatch = assets.length >= rule.min_items;
  }

  return slugMatch && channelMatch && attrMatch && minItemsMatch;
}