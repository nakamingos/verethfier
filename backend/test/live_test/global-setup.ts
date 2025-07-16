/**
 * Global Test Setup for Jest
 * 
 * This file runs once before all tests begin and sets up the database environment
 */

import { DatabaseSetup } from './db-setup';

export default async function globalSetup() {
  console.log('🌍 Global test setup starting...');
  
  // Set environment variables for local Supabase instance
  // These are the standard local Supabase defaults
  process.env.DB_SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
  process.env.DB_SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  
  const dbSetup = DatabaseSetup.getInstance();
  
  try {
    await dbSetup.setupTestEnvironment();
    console.log('🌍 Global test setup completed successfully');
  } catch (error) {
    console.error('🌍 Global test setup failed:', error);
    // Don't throw here - let individual tests handle Supabase availability
  }
}
