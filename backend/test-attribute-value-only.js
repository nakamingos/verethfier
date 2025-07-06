const { DataService } = require('./src/services/data.service');

async function testAttributeValueOnlyRule() {
  // This simulates the case where attribute_key='ALL' and attribute_value='gold'
  const dataService = new DataService();
  
  try {
    console.log('Testing attribute_value-only rule (attribute_key=ALL, attribute_value=gold)...');
    
    // This should search for any attribute that has value 'gold'
    const result = await dataService.checkAssetOwnershipWithCriteria(
      '0x123...', // some address
      'test-collection', // slug
      'ALL', // attribute_key = ALL (means any key)
      'gold', // attribute_value = gold
      1 // min_items
    );
    
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testAttributeValueOnlyRule();
