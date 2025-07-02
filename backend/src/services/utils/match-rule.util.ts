// Utility for matching a rule against assets and channelId
export function matchesRule(rule: any, assets: any[], channelId?: string): boolean {
  const slugMatch = !rule.slug || rule.slug === 'ALL' || assets.some(a => a.slug === rule.slug);
  const channelMatch = !rule.channel_id || rule.channel_id === channelId;
  let attrMatch = true;
  if (rule.attribute_key && rule.attribute_value != null) {
    attrMatch = assets.some(a => a.attributes?.[rule.attribute_key] == rule.attribute_value);
  }
  let minItemsMatch = true;
  if (rule.min_items != null) {
    minItemsMatch = assets.length >= rule.min_items;
  }
  return slugMatch && channelMatch && attrMatch && minItemsMatch;
}
