import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// Global test setup
beforeAll(async () => {
  // Ensure we're using test environment
  console.log('🧪 Test environment configured');
  console.log('📍 Supabase URL:', process.env.SUPABASE_URL || 'http://localhost:54321');
});

// Global test teardown
afterAll(async () => {
  // Cleanup if needed
  console.log('🧹 Test cleanup completed');
});

// Increase timeout for database operations
jest.setTimeout(30000);
