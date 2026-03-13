import dotenv from 'dotenv';
import path from 'path';

const TEST_ENV_PATH = path.resolve(__dirname, '../.env.test');

export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
export const LOCAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.6sbzFWkXWdI8IgJw6DuWTOLFqYKxcgMxhH7wNaKMRNs';
export const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let testEnvLoaded = false;

export function loadTestEnvironment(): void {
  if (testEnvLoaded) {
    return;
  }

  dotenv.config({ path: TEST_ENV_PATH });
  testEnvLoaded = true;
}

export function getTestDataSupabaseUrl(): string {
  loadTestEnvironment();
  return process.env.DATA_SUPABASE_URL || LOCAL_SUPABASE_URL;
}

export function getTestDataSupabaseAnonKey(): string {
  loadTestEnvironment();
  return process.env.DATA_SUPABASE_ANON_KEY || LOCAL_SUPABASE_ANON_KEY;
}

export function getTestDbSupabaseUrl(): string {
  loadTestEnvironment();
  return process.env.DB_SUPABASE_URL || LOCAL_SUPABASE_URL;
}

export function getTestDbSupabaseKey(): string {
  loadTestEnvironment();
  return process.env.DB_SUPABASE_KEY || LOCAL_SUPABASE_SERVICE_ROLE_KEY;
}

export function ensureExplicitTestSupabaseEnv(): void {
  loadTestEnvironment();

  process.env.DATA_SUPABASE_URL ||= getTestDataSupabaseUrl();
  process.env.DATA_SUPABASE_ANON_KEY ||= getTestDataSupabaseAnonKey();
  process.env.DB_SUPABASE_URL ||= getTestDbSupabaseUrl();
  process.env.DB_SUPABASE_KEY ||= getTestDbSupabaseKey();
}
