/**
 * Global Test Setup for Jest
 * 
 * This file runs once before all tests begin and sets up the database environment
 */

import { DatabaseSetup } from './db-setup';
import { ensureExplicitTestSupabaseEnv } from '../test-env';

export default async function globalSetup() {
  console.log('🌍 Global test setup starting...');

  ensureExplicitTestSupabaseEnv();
  
  const dbSetup = DatabaseSetup.getInstance();
  
  try {
    await dbSetup.setupTestEnvironment();
    console.log('🌍 Global test setup completed successfully');
  } catch (error) {
    console.error('🌍 Global test setup failed:', error);
    // Don't throw here - let individual tests handle Supabase availability
  }
}
