import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class TestDatabase {
  private static instance: TestDatabase;
  private supabase: SupabaseClient;

  private constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
    const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
    
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  public static getInstance(): TestDatabase {
    if (!TestDatabase.instance) {
      TestDatabase.instance = new TestDatabase();
    }
    return TestDatabase.instance;
  }

  public getClient(): SupabaseClient {
    return this.supabase;
  }

  // Helper method to clean up test data
  public async cleanupTestData(tableNames: string[] = []): Promise<void> {
    const defaultTables = [
      'verifier_user_roles',
      'verifier_rules', 
      'verifier_servers'
    ];
    
    const tablesToClean = tableNames.length > 0 ? tableNames : defaultTables;
    
    for (const table of tablesToClean) {
      try {
        // Delete test data (be careful not to delete production data)
        await this.supabase
          .from(table)
          .delete()
          .like('id', 'test_%');
        
        // Or delete by specific test identifiers
        await this.supabase
          .from(table)
          .delete()
          .like('server_id', 'test_%');
      } catch (error) {
        console.warn(`Warning: Could not clean table ${table}:`, error);
      }
    }
  }

  // Helper method to create test data
  public async createTestServer(serverId: string = 'test_server_123'): Promise<any> {
    const { data, error } = await this.supabase
      .from('verifier_servers')
      .upsert({
        id: serverId,
        name: 'Test Server',
        role_id: 'test_role_123'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Helper method to create test rule
  public async createTestRule(serverId: string = 'test_server_123'): Promise<any> {
    const { data, error } = await this.supabase
      .from('verifier_rules')
      .insert({
        server_id: serverId,
        server_name: 'Test Server',
        channel_id: 'test_channel_123',
        channel_name: 'test-channel',
        slug: 'test-collection',
        role_id: 'test_role_123',
        role_name: 'Test Role',
        attribute_key: 'test_trait',
        attribute_value: 'rare',
        min_items: 1
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Check if database is accessible
  public async isHealthy(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('verifier_servers')
        .select('count(*)')
        .limit(1);
      
      return !error;
    } catch {
      return false;
    }
  }
}
