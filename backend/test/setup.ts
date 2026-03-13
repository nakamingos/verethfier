import {
  ensureExplicitTestSupabaseEnv,
  getTestDataSupabaseUrl,
  getTestDbSupabaseUrl,
} from './test-env';

ensureExplicitTestSupabaseEnv();

// Global test setup
beforeAll(async () => {
  // Ensure we're using test environment
  console.log('🧪 Test environment configured');
  console.log('📍 DATA_SUPABASE_URL:', getTestDataSupabaseUrl());
  console.log('📍 DB_SUPABASE_URL:', getTestDbSupabaseUrl());
});

// Global test teardown
afterAll(async () => {
  // Cleanup if needed
  console.log('🧹 Test cleanup completed');
});

// Increase timeout for database operations
jest.setTimeout(30000);
