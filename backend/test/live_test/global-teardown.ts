/**
 * Global Test Teardown for Jest
 * 
 * This file runs once after all tests complete and cleans up the database environment
 */

import { DatabaseSetup } from './db-setup';

export default async function globalTeardown() {
  console.log('🌍 Global test teardown starting...');
  
  const dbSetup = DatabaseSetup.getInstance();
  
  try {
    await dbSetup.teardownTestEnvironment();
    console.log('🌍 Global test teardown completed successfully');
  } catch (error) {
    console.error('🌍 Global test teardown failed:', error);
    // Don't throw here - teardown failures shouldn't fail the test suite
  }
}
