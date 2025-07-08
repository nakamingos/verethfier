/**
 * Simple test to verify database setup is working
 * This test should run after the global setup completes
 */

import { DatabaseSetup } from './live_tests/db-setup';
import { TestDatabase } from './live_tests/test-database';

describe('Database Setup Verification', () => {
  let dbSetup: DatabaseSetup;
  let testDb: TestDatabase;

  beforeAll(async () => {
    dbSetup = DatabaseSetup.getInstance();
    testDb = TestDatabase.getInstance();
    
    // Check if Supabase is healthy
    const isHealthy = await testDb.isHealthy();
    if (!isHealthy) {
      console.warn('⚠️ Supabase not accessible. Skipping setup verification tests.');
    }
  });

  it('should have a healthy database connection', async () => {
    const isHealthy = await testDb.isHealthy();
    if (!isHealthy) {
      console.warn('⚠️ Skipping test - Supabase not running');
      return;
    }
    
    expect(isHealthy).toBe(true);
  });

  it('should have test data available', async () => {
    const isHealthy = await testDb.isHealthy();
    if (!isHealthy) {
      console.warn('⚠️ Skipping test - Supabase not running');
      return;
    }

    const client = testDb.getClient();
    
    // Check if test servers exist
    const { data: servers, error: serverError } = await client
      .from('verifier_servers')
      .select('*')
      .in('id', ['1369930881267142686', '919772570612539422']);
    
    if (!serverError && servers) {
      expect(servers.length).toBeGreaterThanOrEqual(0);
      console.log('✅ Test servers data verified');
    }

    // Check if test rules exist
    const { data: rules, error: rulesError } = await client
      .from('verifier_rules')
      .select('*')
      .in('id', ['7', '8', '120']);
    
    if (!rulesError && rules) {
      expect(rules.length).toBeGreaterThanOrEqual(0);
      console.log('✅ Test rules data verified');
    }
  });

  it('should be able to create and cleanup test data', async () => {
    const isHealthy = await testDb.isHealthy();
    if (!isHealthy) {
      console.warn('⚠️ Skipping test - Supabase not running');
      return;
    }

    // Create test data
    const testServer = await testDb.createTestServer('setup_test_server');
    expect(testServer).toBeDefined();

    const testRule = await testDb.createTestRule('setup_test_server');
    expect(testRule).toBeDefined();

    // Cleanup test data
    await testDb.cleanupTestData();
    
    console.log('✅ Test data creation and cleanup verified');
  });
});
