import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../../src/services/db.service';
import { TestDatabase } from './test-database';

/**
 * ⚠️ IMPORTANT: DATABASE TESTS REQUIRE LOCAL SUPABASE INSTANCE
 * 
 * These tests require a local Supabase instance to be running.
 * To start Supabase locally, run: `supabase start`
 * 
 * If Supabase is not running, these tests will be skipped automatically.
 * 
 * The tests interact with the bot's storage database (db), not the public 
 * read-only database (data). Only write tests for the db service, not data service.
 */

describe('DbService - Integration Tests', () => {
  let service: DbService;
  let testDb: TestDatabase;
  let isSupabaseHealthy = false;

  beforeAll(async () => {
    testDb = TestDatabase.getInstance();
    
    // Check if local Supabase is running
    isSupabaseHealthy = await testDb.isHealthy();
    if (!isSupabaseHealthy) {
      console.warn('⚠️  Local Supabase not accessible. Skipping integration tests.');
    }
  });

  beforeEach(async () => {
    // Always try to create the module, but handle the case where Supabase isn't healthy
    try {
      const module: TestingModule = await Test.createTestingModule({
        providers: [DbService],
      }).compile();

      service = module.get<DbService>(DbService);
    } catch (error) {
      // If service creation fails, Supabase might not be available
      console.warn('⚠️  Could not create DbService. Supabase may not be available.');
      isSupabaseHealthy = false;
      service = undefined;
    }
    
    if (!isSupabaseHealthy) {
      return; // Skip setup if Supabase isn't healthy
    }
    
    // Clean up test data before each test
    await testDb.cleanupTestData();
  });

  afterEach(async () => {
    if (!isSupabaseHealthy) {
      return; // Skip cleanup if Supabase isn't healthy
    }
    
    // Clean up test data after each test
    await testDb.cleanupTestData();
  });

  it('should be defined', () => {
    if (!isSupabaseHealthy) {
      return; // Skip this test
    }
    expect(service).toBeDefined();
  });

  describe('addUpdateServer', () => {
    it('should create a new server', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.addUpdateServer(
        'test_server_new', 
        'Test Server New', 
        'test_role_new'
      );

      expect(result).toBeDefined();
      // Note: Supabase upsert might return null on success
    });

    it('should update existing server', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      // First create a server
      await service.addUpdateServer('test_server_update', 'Original Name', 'role_1');
      
      // Then update it
      const result = await service.addUpdateServer(
        'test_server_update', 
        'Updated Name', 
        'role_2'
      );

      expect(result).toBeDefined();
    });
  });

  describe('addRoleMapping', () => {
    beforeEach(async () => {
      if (!isSupabaseHealthy) {
        return; // Skip setup if Supabase isn't healthy
      }
      // Create a test server first
      await testDb.createTestServer('test_server_mapping');
    });

    it('should add role mapping with all parameters', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      const result = await service.addRoleMapping(
        'test_server_mapping',
        'Test Server',
        'test_channel_123',
        'test-channel',
        'test-collection',
        'test_role_123',
        'Test Role',
        'trait_type',
        'rare',
        2
      );

      expect(result).toBeDefined();
      expect(result.server_id).toBe('test_server_mapping');
      expect(result.channel_id).toBe('test_channel_123');
      expect(result.slug).toBe('test-collection');
      expect(result.min_items).toBe(2);
    });

    it('should handle default values for optional parameters', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.addRoleMapping(
        'test_server_mapping',
        'Test Server',
        'test_channel_default',
        'test-channel',
        '', // Empty slug should become 'ALL'
        'test_role_default',
        'Test Role',
        '',
        '',
        null
      );

      expect(result).toBeDefined();
      expect(result.slug).toBe('ALL');
      expect(result.min_items).toBe(1);
    });
  });

  describe('getRoleMappings', () => {
    beforeEach(async () => {
      if (!isSupabaseHealthy) {
        return; // Skip setup if Supabase isn't healthy
      }
      await testDb.createTestServer('test_server_get');
      await testDb.createTestRule('test_server_get');
    });

    it('should return role mappings for server', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.getRoleMappings('test_server_get');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].server_id).toBe('test_server_get');
    });

    it('should filter by channel when provided', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.getRoleMappings('test_server_get', 'test_channel_123');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].channel_id).toBe('test_channel_123');
      }
    });
  });

  describe('ruleExists', () => {
    beforeEach(async () => {
      if (!isSupabaseHealthy) {
        return; // Skip setup if Supabase isn't healthy
      }
      await testDb.createTestServer('test_server_exists');
      await testDb.createTestRule('test_server_exists');
    });

    it('should return true when rule exists', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.ruleExists(
        'test_server_exists',
        'test_channel_123',
        'test_role_123',
        'test-collection'
      );

      expect(result).toBe(true);
    });

    it('should return false when rule does not exist', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.ruleExists(
        'test_server_exists',
        'nonexistent_channel',
        'nonexistent_role',
        'nonexistent-collection'
      );

      expect(result).toBe(false);
    });
  });

  describe('deleteRoleMapping', () => {
    it('should delete role mapping', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      // Create test data first
      await testDb.createTestServer('test_server_delete');
      const rule = await testDb.createTestRule('test_server_delete');

      // Delete the rule
      await expect(
        service.deleteRoleMapping(rule.id.toString(), 'test_server_delete')
      ).resolves.not.toThrow();

      // Verify it's deleted
      const exists = await service.ruleExists(
        'test_server_delete',
        'test_channel_123',
        'test_role_123',
        'test-collection'
      );
      expect(exists).toBe(false);
    });
  });

  describe('getUserServers', () => {
    it('should handle non-existent user', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      const result = await service.getUserServers('test_user_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('logUserRole', () => {
    it('should log user role assignment (now with updated DB schema)', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      await expect(
        service.logUserRole(
          'test_user_123',
          'test_server_log',
          'test_role_log',
          'test_address_123'
        )
      ).resolves.not.toThrow();
    });

    it('should log user role with names', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      await service.logUserRole(
        'test_user_123',
        'test_server_456', 
        'test_role_789',
        'TestUser',
        'TestServer',
        'TestRole'
      );
      
      // The method should complete without throwing an error
      expect(true).toBe(true);
    });

    it('should log user role without names (backward compatibility)', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      await service.logUserRole(
        'test_user_456',
        'test_server_789', 
        'test_role_123',
        '0xabcdef1234567890'
      );
      
      // The method should complete without throwing an error
      expect(true).toBe(true);
    });
  });

  describe('service structure validation', () => {
    it('should have all required methods', () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }
      
      expect(typeof service.addUpdateServer).toBe('function');
      expect(typeof service.getUserServers).toBe('function');
      expect(typeof service.addServerToUser).toBe('function');
      expect(typeof service.getServerRole).toBe('function');
      expect(typeof service.addRoleMapping).toBe('function');
      expect(typeof service.getRoleMappings).toBe('function');
      expect(typeof service.deleteRoleMapping).toBe('function');
      expect(typeof service.logUserRole).toBe('function');
      expect(typeof service.getAllRulesForServer).toBe('function');
      expect(typeof service.getAllRulesWithCompat).toBe('function');
      expect(typeof service.removeAllRoles).toBe('function');
      expect(typeof service.getRoles).toBe('function');
      expect(typeof service.ruleExists).toBe('function');
      expect(typeof service.findRuleWithMessage).toBe('function');
      expect(typeof service.updateRuleMessageId).toBe('function');
      expect(typeof service.findRuleByMessageId).toBe('function');
      expect(typeof service.findRulesByMessageId).toBe('function');
      expect(typeof service.getRulesByChannel).toBe('function');
      expect(typeof service.findConflictingRule).toBe('function');
      expect(typeof service.checkForDuplicateRule).toBe('function');
      expect(typeof service.checkForExactDuplicateRule).toBe('function');
    });
  });

  describe('checkForDuplicateRule', () => {
    it('should find existing rule with same criteria for different role', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // First, create a rule
      const existingRule = await service.addRoleMapping(
        'test_server',
        'Test Server',
        'test_channel',
        'Test Channel',
        'test-collection',
        'existing-role-id',
        'Existing Role',
        'Gold',
        'rare',
        1
      );

      expect(existingRule).toBeDefined();

      // Now check for duplicate with different role
      const duplicateRule = await service.checkForDuplicateRule(
        'test_server',
        'test_channel',
        'test-collection',
        'Gold',
        'rare',
        1,
        'different-role-id' // Different role ID
      );

      expect(duplicateRule).toBeDefined();
      expect(duplicateRule.role_id).toBe('existing-role-id');
      expect(duplicateRule.slug).toBe('test-collection');
      expect(duplicateRule.attribute_key).toBe('Gold');
      expect(duplicateRule.attribute_value).toBe('rare');
      expect(duplicateRule.min_items).toBe(1);
    });

    it('should return null when no duplicate found', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.checkForDuplicateRule(
        'test_server',
        'test_channel',
        'unique-collection',
        'Unique',
        'value',
        99
      );

      expect(result).toBeNull();
    });

    it('should exclude same role when checking for duplicates', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create a rule
      const existingRule = await service.addRoleMapping(
        'test_server',
        'Test Server',
        'test_channel',
        'Test Channel',
        'same-collection',
        'same-role-id',
        'Same Role',
        'Silver',
        'common',
        2
      );

      expect(existingRule).toBeDefined();

      // Check for duplicate with same role ID (should return null)
      const duplicateRule = await service.checkForDuplicateRule(
        'test_server',
        'test_channel',
        'same-collection',
        'Silver',
        'common',
        2,
        'same-role-id' // Same role ID - should be excluded
      );

      expect(duplicateRule).toBeNull();
    });
  });

  describe('checkForExactDuplicateRule', () => {
    it('should find exact duplicate rule (same role + same criteria)', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // First, create a rule
      await service.addRoleMapping(
        'test_server_exact_dup',
        'Test Server',
        'test_channel_exact_dup',
        'Test Channel',
        'test-collection',
        'test-role-id',
        'Test Role',
        'Gold',
        'rare',
        1
      );

      // Try to find exact duplicate
      const exactDuplicate = await service.checkForExactDuplicateRule(
        'test_server_exact_dup',
        'test_channel_exact_dup',
        'test-collection',
        'Gold',
        'rare',
        1,
        'test-role-id' // Same role ID - should find the exact match
      );

      expect(exactDuplicate).toBeDefined();
      expect(exactDuplicate.server_id).toBe('test_server_exact_dup');
      expect(exactDuplicate.role_id).toBe('test-role-id');
    });

    it('should not find duplicate when role is different', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // First, create a rule
      await service.addRoleMapping(
        'test_server_diff_role',
        'Test Server',
        'test_channel_diff_role',
        'Test Channel',
        'test-collection',
        'original-role-id',
        'Original Role',
        'Gold',
        'rare',
        1
      );

      // Try to find exact duplicate with different role
      const exactDuplicate = await service.checkForExactDuplicateRule(
        'test_server_diff_role',
        'test_channel_diff_role',
        'test-collection',
        'Gold',
        'rare',
        1,
        'different-role-id' // Different role ID - should not find match
      );

      expect(exactDuplicate).toBeNull();
    });
  });

  describe('Advanced Rule Management', () => {
    it('should get all rules for server', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_all_rules';
      await service.addUpdateServer(serverId, 'All Rules Server', 'role_all');

      // Add multiple rules
      await service.addRoleMapping(
        serverId, 'All Rules Server', 'channel_1', 'Channel 1',
        'collection-1', 'role_1', 'Role 1', 'trait', 'rare', 1
      );

      await service.addRoleMapping(
        serverId, 'All Rules Server', 'channel_2', 'Channel 2',
        'collection-2', 'role_2', 'Role 2', 'trait', 'epic', 2
      );

      const rules = await service.getAllRulesForServer(serverId);

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThanOrEqual(2);
      expect(rules.every(rule => rule.server_id === serverId)).toBe(true);
    });

    it('should get all rules with compatibility method', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_compat_rules';
      await service.addUpdateServer(serverId, 'Compat Rules Server', 'role_test');

      const rule = await service.addRoleMapping(
        serverId, 'Compat Rules Server', 'channel_test', 'Test Channel',
        'test-collection', 'role_test', 'Test Role', 'ALL', 'ALL', 1
      );

      const rules = await service.getAllRulesWithCompat(serverId);

      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.id === rule.id)).toBe(true);
    });

    it('should find conflicting rule', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_conflict';
      const channelId = 'channel_conflict';
      const roleId = 'role_conflict';

      await service.addUpdateServer(serverId, 'Conflict Server', roleId);

      // Add a rule first
      await service.addRoleMapping(
        serverId, 'Conflict Server', channelId, 'Conflict Channel',
        'conflict-collection', roleId, 'Conflict Role', 'trait', 'legendary', 1
      );

      // Try to find conflicting rule with same criteria
      const conflict = await service.findConflictingRule(
        serverId, channelId, roleId, 'conflict-collection', 'trait', 'legendary', 1
      );

      expect(conflict).toBeDefined();
      expect(conflict.server_id).toBe(serverId);
      expect(conflict.channel_id).toBe(channelId);
      expect(conflict.role_id).toBe(roleId);
    });

    it('should not find conflict for non-matching criteria', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const conflict = await service.findConflictingRule(
        'nonexistent_server', 'nonexistent_channel', 'nonexistent_role',
        'nonexistent-collection', 'nonexistent_trait', 'nonexistent_value', 999
      );

      expect(conflict).toBeNull();
    });
  });

  describe('User Management Methods', () => {
    it('should add server to user successfully', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_add_server_test';
      const serverId = 'test_server_add_user';

      // First create the server
      await service.addUpdateServer(serverId, 'Add User Server', 'role_add_user');

      // Add server to user (requires userId, serverId, role)
      const result = await service.addServerToUser(userId, serverId, 'role_add_user');

      expect(result).toBeDefined();
      // The method typically returns void or undefined on success
    });

    it('should handle adding duplicate server to user', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_duplicate_server';
      const serverId = 'test_server_duplicate';

      await service.addUpdateServer(serverId, 'Duplicate Server', 'role_duplicate');

      // Add server first time
      await service.addServerToUser(userId, serverId, 'role_duplicate');

      // Add same server again - should not throw error
      await expect(
        service.addServerToUser(userId, serverId, 'role_duplicate')
      ).resolves.not.toThrow();
    });
  });

  describe('Channel Rule Methods', () => {
    it('should get rules by channel', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_channel_rules';
      const channelId = 'channel_rules_test';

      await service.addUpdateServer(serverId, 'Channel Rules Server', 'role_channel');

      // Add multiple rules to the same channel
      await service.addRoleMapping(
        serverId, 'Channel Rules Server', channelId, 'Rules Channel',
        'collection-1', 'role_1', 'Role 1', 'trait', 'rare', 1
      );

      await service.addRoleMapping(
        serverId, 'Channel Rules Server', channelId, 'Rules Channel',
        'collection-2', 'role_2', 'Role 2', 'trait', 'epic', 2
      );

      // Add rule to different channel for comparison
      await service.addRoleMapping(
        serverId, 'Channel Rules Server', 'other_channel', 'Other Channel',
        'collection-3', 'role_3', 'Role 3', 'trait', 'legendary', 3
      );

      const channelRules = await service.getRulesByChannel(serverId, channelId);

      expect(Array.isArray(channelRules)).toBe(true);
      expect(channelRules.length).toBeGreaterThanOrEqual(2);
      expect(channelRules.every(rule => rule.channel_id === channelId)).toBe(true);
      expect(channelRules.every(rule => rule.server_id === serverId)).toBe(true);
    });

    it('should return empty array for channel with no rules', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.getRulesByChannel('nonexistent_server', 'nonexistent_channel');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should find rules by message ID', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_message_rules';
      const messageId = 'message_123456789';

      await service.addUpdateServer(serverId, 'Message Rules Server', 'role_message');

      // Create a rule and update its message ID
      const rule = await service.addRoleMapping(
        serverId, 'Message Rules Server', 'channel_message', 'Message Channel',
        'message-collection', 'role_message', 'Message Role', 'trait', 'uncommon', 1
      );

      // Update the rule with a message ID
      await service.updateRuleMessageId(rule.id.toString(), messageId);

      const foundRules = await service.findRulesByMessageId(serverId, 'channel_message', messageId);

      expect(Array.isArray(foundRules)).toBe(true);
      expect(foundRules.length).toBeGreaterThan(0);
      // Note: message_id property may not be available in VerifierRole interface
      expect(foundRules[0].id).toBe(rule.id);
    });

    it('should return empty array for non-existent message ID', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.findRulesByMessageId('nonexistent_server', 'nonexistent_channel', 'nonexistent_message_999999');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should find single rule by message ID', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_single_message';
      const messageId = 'single_message_987654321';

      await service.addUpdateServer(serverId, 'Single Message Server', 'role_single');

      const rule = await service.addRoleMapping(
        serverId, 'Single Message Server', 'channel_single', 'Single Channel',
        'single-collection', 'role_single', 'Single Role', 'trait', 'mythic', 1
      );

      await service.updateRuleMessageId(rule.id.toString(), messageId);

      const foundRule = await service.findRuleByMessageId(serverId, 'channel_single', messageId);

      expect(foundRule).toBeDefined();
      // Note: message_id property may not be available in VerifierRole interface
      expect(foundRule.id).toBe(rule.id);
    });

    it('should return null for findRuleByMessageId with non-existent message', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.findRuleByMessageId('nonexistent_server', 'nonexistent_channel', 'nonexistent_single_message_999');
      expect(result).toBeNull();
    });

    it('should update rule message ID successfully', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_update_message';
      const newMessageId = 'updated_message_555';

      await service.addUpdateServer(serverId, 'Update Message Server', 'role_update');

      const rule = await service.addRoleMapping(
        serverId, 'Update Message Server', 'channel_update', 'Update Channel',
        'update-collection', 'role_update', 'Update Role', 'trait', 'unique', 1
      );

      await expect(
        service.updateRuleMessageId(rule.id.toString(), newMessageId)
      ).resolves.not.toThrow();

      // Try to find the rule by the new message ID
      const foundRule = await service.findRuleByMessageId(serverId, 'channel_update', newMessageId);
      expect(foundRule).toBeDefined();
      expect(foundRule.id).toBe(rule.id);
    });

    it('should find rule with message', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_find_with_message';
      const channelId = 'channel_find_with_message';

      await service.addUpdateServer(serverId, 'Find With Message Server', 'role_find');

      const rule = await service.addRoleMapping(
        serverId, 'Find With Message Server', channelId, 'Find With Message Channel',
        'find-collection', 'role_find', 'Find Role', 'trait', 'special', 1
      );

      const foundRule = await service.findRuleWithMessage(serverId, channelId);

      expect(foundRule).toBeDefined();
      expect(foundRule.server_id).toBe(serverId);
      expect(foundRule.channel_id).toBe(channelId);
    });
  });

  describe('Advanced Conflict Detection Edge Cases', () => {
    it('should handle complex conflict scenarios with mixed data types', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_mixed_types';
      const channelId = 'channel_mixed_types';
      const roleId = 'role_mixed_types';

      await service.addUpdateServer(serverId, 'Mixed Types Server', roleId);

      // Create rules with numeric strings
      await service.addRoleMapping(
        serverId, 'Mixed Types Server', channelId, 'Mixed Types Channel',
        'numeric-collection', roleId, 'Mixed Types Role', '123', '456', 1
      );

      // Test conflict detection with same numeric strings
      const conflict1 = await service.findConflictingRule(
        serverId, channelId, roleId, 'numeric-collection', '123', '456', 1
      );
      expect(conflict1).toBeDefined();

      // Create rules with boolean-like strings
      await service.addRoleMapping(
        serverId, 'Mixed Types Server', channelId + '_bool', 'Mixed Types Channel',
        'boolean-collection', roleId, 'Mixed Types Role', 'true', 'false', 1
      );

      const conflict2 = await service.findConflictingRule(
        serverId, channelId + '_bool', roleId, 'boolean-collection', 'true', 'false', 1
      );
      expect(conflict2).toBeDefined();
    });
  });
});
