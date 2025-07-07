require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Test script to verify database column names match our code
const supabaseUrl = process.env.DB_SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.DB_SUPABASE_KEY || 'your-anon-key';

if (supabaseUrl.includes('your-project') || supabaseKey.includes('your-anon-key')) {
  console.log('❌ Please set DB_SUPABASE_URL and DB_SUPABASE_KEY environment variables');
  console.log('💡 Create a .env file based on env.example');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabaseColumns() {
  console.log('🔍 Testing database column names...');
  
  try {
    // Test the verifier_user_roles table structure by attempting to insert test data
    const testAssignment = {
      user_id: 'test_user_123',
      server_id: 'test_server_456',
      role_id: 'test_role_789',
      address: '0x1234567890123456789012345678901234567890',
      status: 'active',
      verified_at: new Date().toISOString(),
      last_checked: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
      user_name: 'TestUser',
      server_name: 'TestServer',
      role_name: 'TestRole'
    };
    
    console.log('📝 Attempting to insert test data with correct column names...');
    
    const { data, error } = await supabase
      .from('verifier_user_roles')
      .insert(testAssignment)
      .select()
      .single();
    
    if (error) {
      console.log('❌ Error inserting test data:', error.message);
      return false;
    }
    
    console.log('✅ Successfully inserted test data with ID:', data.id);
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    const { error: deleteError } = await supabase
      .from('verifier_user_roles')
      .delete()
      .eq('id', data.id);
    
    if (deleteError) {
      console.log('⚠️  Warning: Failed to clean up test data:', deleteError.message);
    } else {
      console.log('✅ Test data cleaned up successfully');
    }
    
    return true;
    
  } catch (error) {
    console.log('❌ Error testing database columns:', error.message);
    return false;
  }
}

testDatabaseColumns().then(success => {
  if (success) {
    console.log('🎉 Database column names are correctly configured!');
  } else {
    console.log('💥 Database column name mismatch detected!');
  }
  process.exit(success ? 0 : 1);
});
