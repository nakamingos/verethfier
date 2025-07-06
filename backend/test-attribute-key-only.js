// Quick test for attribute_key only matching
// This would create a rule that matches any asset with a "Gold" attribute, regardless of value

const testRule = {
  slug: 'my-collection',
  attribute_key: 'Gold',
  attribute_value: 'ALL', // or null/empty - should match ANY value
  min_items: 1
};

// This should match assets with:
// - Gold: "legendary"
// - Gold: "rare" 
// - Gold: "common"
// - Gold: 123
// - Gold: true
// etc.

// Expected display in Discord:
// Collection: my-collection
// Attribute: Gold (any value)
// Min Items: 1

console.log('Test rule for attribute_key only matching created');
