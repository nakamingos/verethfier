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

  // Seed comprehensive test data for extended DB service tests
  public async seedExtendedTestData(): Promise<any> {
    try {
      // Create a server for standard tests
      const server = await this.supabase
        .from('verifier_servers')
        .upsert({
          id: 'test_guild_id',
          name: 'Test Guild',
          role_id: 'default_role_id'
        })
        .select()
        .single();

      // Create a server for legacy tests
      const legacyServer = await this.supabase
        .from('verifier_servers')
        .upsert({
          id: 'test_server_id',
          name: 'Test Server',
          role_id: 'default_role_id'
        })
        .select()
        .single();

      // Create standard rules for channel-based tests
      const rule1 = await this.supabase
        .from('verifier_rules')
        .insert({
          server_id: 'test_guild_id',
          server_name: 'Test Guild',
          channel_id: 'test_channel_id',
          channel_name: 'Test Channel',
          slug: 'collection-1',
          role_id: 'role_id_1',
          role_name: 'Role 1',
          attribute_key: 'key1',
          attribute_value: 'value1',
          min_items: 1
        })
        .select()
        .single();

      const rule2 = await this.supabase
        .from('verifier_rules')
        .insert({
          server_id: 'test_guild_id',
          server_name: 'Test Guild',
          channel_id: 'test_channel_id',
          channel_name: 'Test Channel',
          slug: 'collection-2',
          role_id: 'role_id_2',
          role_name: 'Role 2',
          attribute_key: 'key2',
          attribute_value: 'value2',
          min_items: 2
        })
        .select()
        .single();

      // Create modern rule for legacy comparison tests
      const modernRule = await this.supabase
        .from('verifier_rules')
        .insert({
          server_id: 'test_server_id',
          server_name: 'Test Server',
          channel_id: 'modern_channel',
          channel_name: 'Modern Channel',
          slug: 'modern-collection',
          role_id: 'modern_role_id',
          role_name: 'Modern Role',
          attribute_key: 'modern_key',
          attribute_value: 'modern_value',
          min_items: 1
        })
        .select()
        .single();

      // Create legacy rules
      const legacyRule1 = await this.supabase
        .from('verifier_rules')
        .insert({
          server_id: 'test_server_id',
          server_name: 'Test Server',
          channel_id: 'legacy_channel',
          channel_name: 'Legacy Channel',
          slug: 'legacy_collection',
          role_id: 'legacy_role_1',
          role_name: 'Legacy Role 1',
          attribute_key: 'legacy_key',
          attribute_value: 'legacy_value',
          min_items: 1
        })
        .select()
        .single();

      const legacyRule2 = await this.supabase
        .from('verifier_rules')
        .insert({
          server_id: 'test_server_id',
          server_name: 'Test Server',
          channel_id: 'legacy_channel',
          channel_name: 'Legacy Channel',
          slug: 'legacy_collection',
          role_id: 'legacy_role_2',
          role_name: 'Legacy Role 2',
          attribute_key: 'legacy_key',
          attribute_value: 'legacy_value',
          min_items: 1
        })
        .select()
        .single();

      return {
        server: server.data,
        legacyServer: legacyServer.data,
        rule1: rule1.data,
        rule2: rule2.data,
        modernRule: modernRule.data,
        legacyRule1: legacyRule1.data,
        legacyRule2: legacyRule2.data
      };
    } catch (error) {
      console.error('Error seeding extended test data:', error);
      throw error;
    }
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
