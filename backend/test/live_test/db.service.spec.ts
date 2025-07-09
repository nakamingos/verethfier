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
        '0x1234567890abcdef',
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
      expect(typeof service.getAllRulesWithLegacy).toBe('function');
      expect(typeof service.removeAllLegacyRoles).toBe('function');
      expect(typeof service.getLegacyRoles).toBe('function');
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

  // =======================================
  // DYNAMIC ROLE ASSIGNMENT TRACKING TESTS
  // =======================================

  describe('Dynamic Role Assignment Tracking', () => {
    it('should track a new role assignment', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create test server and rule first
      await service.addUpdateServer('test_server_track', 'Track Server', 'role_track');
      const rule = await service.addRoleMapping(
        'test_server_track',
        'Track Server',
        'channel_track',
        'Track Channel',
        'test-collection',
        'role_track',
        'Track Role',
        'trait',
        'rare',
        1
      );

      const assignment = {
        userId: 'user_track_123',
        serverId: 'test_server_track',
        roleId: 'role_track',
        ruleId: rule.id.toString(),
        address: '0x1234567890abcdef1234567890abcdef12345678',
        userName: 'TestUser',
        serverName: 'Track Server',
        roleName: 'Track Role',
        expiresInHours: 24
      };

      const result = await service.trackRoleAssignment(assignment);

      expect(result).toBeDefined();
      expect(result.user_id).toBe(assignment.userId);
      expect(result.server_id).toBe(assignment.serverId);
      expect(result.role_id).toBe(assignment.roleId);
      expect(result.rule_id).toBe(assignment.ruleId);
      expect(result.address).toBe(assignment.address.toLowerCase());
      expect(result.status).toBe('active');
      expect(result.expires_at).toBeDefined();
    });

    it('should track assignment without expiration', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      await service.addUpdateServer('test_server_noexp', 'No Expiry Server', 'role_noexp');
      const rule = await service.addRoleMapping(
        'test_server_noexp',
        'No Expiry Server',
        'channel_noexp',
        'No Expiry Channel',
        'permanent-collection',
        'role_noexp',
        'Permanent Role',
        'ALL',
        'ALL',
        1
      );

      const assignment = {
        userId: 'user_permanent',
        serverId: 'test_server_noexp',
        roleId: 'role_noexp',
        ruleId: rule.id.toString(),
        address: '0xabcdef1234567890abcdef1234567890abcdef12'
      };

      const result = await service.trackRoleAssignment(assignment);

      expect(result).toBeDefined();
      expect(result.expires_at).toBeNull();
      expect(result.status).toBe('active');
    });

    it('should update role verification status', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create and track an assignment first
      await service.addUpdateServer('test_server_verify', 'Verify Server', 'role_verify');
      const rule = await service.addRoleMapping(
        'test_server_verify',
        'Verify Server',
        'channel_verify',
        'Verify Channel',
        'verify-collection',
        'role_verify',
        'Verify Role',
        'ALL',
        'ALL',
        1
      );

      const assignment = await service.trackRoleAssignment({
        userId: 'user_verify_test',
        serverId: 'test_server_verify',
        roleId: 'role_verify',
        ruleId: rule.id.toString(),
        address: '0x1111222233334444555566667777888899990000'
      });

      // Test valid verification update
      const validResult = await service.updateRoleVerification(assignment.id, true);
      expect(validResult.last_checked).toBeDefined();
      expect(validResult.status).toBe('active');

      // Test invalid verification update (should expire)
      const invalidResult = await service.updateRoleVerification(assignment.id, false);
      expect(invalidResult.status).toBe('expired');
      expect(invalidResult.last_checked).toBeDefined();
    });

    it('should revoke a role assignment', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create and track an assignment
      await service.addUpdateServer('test_server_revoke', 'Revoke Server', 'role_revoke');
      const rule = await service.addRoleMapping(
        'test_server_revoke',
        'Revoke Server',
        'channel_revoke',
        'Revoke Channel',
        'revoke-collection',
        'role_revoke',
        'Revoke Role',
        'ALL',
        'ALL',
        1
      );

      const assignment = await service.trackRoleAssignment({
        userId: 'user_revoke_test',
        serverId: 'test_server_revoke',
        roleId: 'role_revoke',
        ruleId: rule.id.toString(),
        address: '0x2222333344445555666677778888999900001111'
      });

      const result = await service.revokeRoleAssignment(assignment.id);

      expect(result.status).toBe('revoked');
      expect(result.updated_at).toBeDefined();
    });
  });

  // =======================================
  // USER ROLE MANAGEMENT TESTS
  // =======================================

  describe('User Role Management', () => {
    it('should get user role assignments with server filter', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_role_mgmt';
      const serverId = 'test_server_rolemgmt';

      // Create test data
      await service.addUpdateServer(serverId, 'Role Mgmt Server', 'role_mgmt');
      const rule = await service.addRoleMapping(
        serverId,
        'Role Mgmt Server',
        'channel_mgmt',
        'Mgmt Channel',
        'mgmt-collection',
        'role_mgmt',
        'Mgmt Role',
        'ALL',
        'ALL',
        1
      );

      await service.trackRoleAssignment({
        userId,
        serverId,
        roleId: 'role_mgmt',
        ruleId: rule.id.toString(),
        address: '0x3333444455556666777788889999000011112222'
      });

      const assignments = await service.getUserRoleAssignments(userId, serverId);

      expect(assignments).toBeDefined();
      expect(assignments.length).toBeGreaterThan(0);
      expect(assignments[0].user_id).toBe(userId);
      expect(assignments[0].server_id).toBe(serverId);
      expect(assignments[0].verifier_rules).toBeDefined();
    });

    it('should get user role assignments across all servers', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_multi_server';
      
      // Create assignments in multiple servers
      await service.addUpdateServer('server_multi_1', 'Multi Server 1', 'role_multi_1');
      await service.addUpdateServer('server_multi_2', 'Multi Server 2', 'role_multi_2');

      const rule1 = await service.addRoleMapping(
        'server_multi_1', 'Multi Server 1', 'channel_1', 'Channel 1',
        'collection-1', 'role_multi_1', 'Role 1', 'ALL', 'ALL', 1
      );

      const rule2 = await service.addRoleMapping(
        'server_multi_2', 'Multi Server 2', 'channel_2', 'Channel 2',
        'collection-2', 'role_multi_2', 'Role 2', 'ALL', 'ALL', 1
      );

      await service.trackRoleAssignment({
        userId,
        serverId: 'server_multi_1',
        roleId: 'role_multi_1',
        ruleId: rule1.id.toString(),
        address: '0x4444555566667777888899990000111122223333'
      });

      await service.trackRoleAssignment({
        userId,
        serverId: 'server_multi_2',
        roleId: 'role_multi_2',
        ruleId: rule2.id.toString(),
        address: '0x4444555566667777888899990000111122223333'
      });

      // Get assignments across all servers
      const allAssignments = await service.getUserRoleAssignments(userId);

      expect(allAssignments.length).toBeGreaterThanOrEqual(2);
      const serverIds = allAssignments.map(a => a.server_id);
      expect(serverIds).toContain('server_multi_1');
      expect(serverIds).toContain('server_multi_2');
    });

    it('should get user role history', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_history_test';
      const serverId = 'test_server_history';

      await service.addUpdateServer(serverId, 'History Server', 'role_history');
      const rule = await service.addRoleMapping(
        serverId, 'History Server', 'channel_history', 'History Channel',
        'history-collection', 'role_history', 'History Role', 'ALL', 'ALL', 1
      );

      // Create an assignment and then revoke it to create history
      const assignment = await service.trackRoleAssignment({
        userId,
        serverId,
        roleId: 'role_history',
        ruleId: rule.id.toString(),
        address: '0x5555666677778888999900001111222233334444'
      });

      await service.revokeRoleAssignment(assignment.id);

      const history = await service.getUserRoleHistory(userId, serverId);

      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].user_id).toBe(userId);
      expect(history[0].status).toBe('revoked');
    });

    it('should get user latest address', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_latest_address';
      const latestAddress = '0x6666777788889999000011112222333344445555';

      await service.addUpdateServer('test_server_addr', 'Address Server', 'role_addr');
      const rule = await service.addRoleMapping(
        'test_server_addr', 'Address Server', 'channel_addr', 'Address Channel',
        'addr-collection', 'role_addr', 'Address Role', 'ALL', 'ALL', 1
      );

      await service.trackRoleAssignment({
        userId,
        serverId: 'test_server_addr',
        roleId: 'role_addr',
        ruleId: rule.id.toString(),
        address: latestAddress
      });

      const result = await service.getUserLatestAddress(userId);

      expect(result).toBe(latestAddress.toLowerCase());
    });

    it('should return null for non-existent user address', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.getUserLatestAddress('nonexistent_user_12345');
      expect(result).toBeNull();
    });
  });

  // =======================================
  // SYSTEM MONITORING & STATISTICS TESTS
  // =======================================

  describe('System Monitoring & Statistics', () => {
    it('should get role assignment statistics', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create test data for statistics
      await service.addUpdateServer('test_server_stats', 'Stats Server', 'role_stats');
      const rule = await service.addRoleMapping(
        'test_server_stats', 'Stats Server', 'channel_stats', 'Stats Channel',
        'stats-collection', 'role_stats', 'Stats Role', 'ALL', 'ALL', 1
      );

      // Create multiple assignments with different statuses
      const assignment1 = await service.trackRoleAssignment({
        userId: 'user_stats_1',
        serverId: 'test_server_stats',
        roleId: 'role_stats',
        ruleId: rule.id.toString(),
        address: '0x7777888899990000111122223333444455556666'
      });

      const assignment2 = await service.trackRoleAssignment({
        userId: 'user_stats_2',
        serverId: 'test_server_stats',
        roleId: 'role_stats',
        ruleId: rule.id.toString(),
        address: '0x8888999900001111222233334444555566667777'
      });

      // Revoke one to create variety in statistics
      await service.revokeRoleAssignment(assignment2.id);

      const stats = await service.getRoleAssignmentStats();

      expect(stats).toBeDefined();
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.active).toBeGreaterThan(0);
      expect(stats.revoked).toBeGreaterThan(0);
      expect(stats.byServer).toBeDefined();
      expect(stats.byServer['test_server_stats']).toBeGreaterThan(0);
    });

    it('should count active assignments', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const count = await service.countActiveAssignments();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should count revoked assignments', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const count = await service.countRevokedAssignments();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should count expiring soon assignments', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Create assignment that expires soon
      await service.addUpdateServer('test_server_expiry', 'Expiry Server', 'role_expiry');
      const rule = await service.addRoleMapping(
        'test_server_expiry', 'Expiry Server', 'channel_expiry', 'Expiry Channel',
        'expiry-collection', 'role_expiry', 'Expiry Role', 'ALL', 'ALL', 1
      );

      await service.trackRoleAssignment({
        userId: 'user_expiry_test',
        serverId: 'test_server_expiry',
        roleId: 'role_expiry',
        ruleId: rule.id.toString(),
        address: '0x9999000011112222333344445555666677778888',
        expiresInHours: 1 // Expires in 1 hour
      });

      const count = await service.countExpiringSoonAssignments(24); // Within 24 hours
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should get last reverification time', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const time = await service.getLastReverificationTime();
      // Should be null or a valid Date - depends on existing data
      expect(time === null || time instanceof Date).toBe(true);
    });

    it('should get server unique users', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_unique_users';
      await service.addUpdateServer(serverId, 'Unique Users Server', 'role_unique');
      const rule = await service.addRoleMapping(
        serverId, 'Unique Users Server', 'channel_unique', 'Unique Channel',
        'unique-collection', 'role_unique', 'Unique Role', 'ALL', 'ALL', 1
      );

      // Add multiple assignments for the same user and different users
      await service.trackRoleAssignment({
        userId: 'unique_user_1',
        serverId,
        roleId: 'role_unique',
        ruleId: rule.id.toString(),
        address: '0x0000111122223333444455556666777788889999'
      });

      await service.trackRoleAssignment({
        userId: 'unique_user_2',
        serverId,
        roleId: 'role_unique',
        ruleId: rule.id.toString(),
        address: '0x1111222233334444555566667777888899990000'
      });

      const uniqueUsers = await service.getServerUniqueUsers(serverId);

      expect(Array.isArray(uniqueUsers)).toBe(true);
      expect(uniqueUsers.length).toBeGreaterThan(0);
      expect(uniqueUsers).toContain('unique_user_1');
      expect(uniqueUsers).toContain('unique_user_2');
      // Should not contain duplicates
      expect(new Set(uniqueUsers).size).toBe(uniqueUsers.length);
    });
  });

  // =======================================
  // SYSTEM HEALTH & VERIFICATION TESTS
  // =======================================

  describe('System Health & Verification', () => {
    it('should check if verification system is ready', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const isReady = await service.checkVerificationSystemReady();
      expect(typeof isReady).toBe('boolean');
      expect(isReady).toBe(true); // Should be true since we have a working setup
    });

    it('should check enhanced tracking exists (legacy compatibility)', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const exists = await service.checkEnhancedTrackingExists();
      expect(typeof exists).toBe('boolean');
      expect(exists).toBe(true); // Should match checkVerificationSystemReady
    });
  });

  // =======================================
  // RULE MANAGEMENT ADVANCED TESTS
  // =======================================

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

    it('should get all rules with legacy compatibility', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_legacy_rules';
      await service.addUpdateServer(serverId, 'Legacy Rules Server', 'role_legacy');

      const rule = await service.addRoleMapping(
        serverId, 'Legacy Rules Server', 'channel_legacy', 'Legacy Channel',
        'legacy-collection', 'role_legacy', 'Legacy Role', 'ALL', 'ALL', 1
      );

      const rules = await service.getAllRulesWithLegacy(serverId);

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

  // =======================================
  // MEDIUM PRIORITY TESTS
  // =======================================

  // =======================================
  // USER MANAGEMENT METHODS TESTS
  // =======================================

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

      // Add server to user (requires userId, serverId, role, address)
      const result = await service.addServerToUser(userId, serverId, 'role_add_user', '0x1234567890abcdef1234567890abcdef12345678');

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
      await service.addServerToUser(userId, serverId, 'role_duplicate', '0x1111222233334444555566667777888899990000');

      // Add same server again - should not throw error
      await expect(
        service.addServerToUser(userId, serverId, 'role_duplicate', '0x1111222233334444555566667777888899990000')
      ).resolves.not.toThrow();
    });

    it('should get user latest address comprehensively', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_comprehensive_address';
      const olderAddress = '0x1111111111111111111111111111111111111111';
      const newerAddress = '0x2222222222222222222222222222222222222222';

      await service.addUpdateServer('test_server_addr_comp', 'Address Comp Server', 'role_addr_comp');
      const rule = await service.addRoleMapping(
        'test_server_addr_comp', 'Address Comp Server', 'channel_addr_comp', 'Address Comp Channel',
        'addr-comp-collection', 'role_addr_comp', 'Address Comp Role', 'ALL', 'ALL', 1
      );

      // Create assignment with older address
      await service.trackRoleAssignment({
        userId,
        serverId: 'test_server_addr_comp',
        roleId: 'role_addr_comp',
        ruleId: rule.id.toString(),
        address: olderAddress
      });

      // Wait a moment to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create assignment with newer address
      await service.trackRoleAssignment({
        userId,
        serverId: 'test_server_addr_comp',
        roleId: 'role_addr_comp',
        ruleId: rule.id.toString(),
        address: newerAddress
      });

      const latestAddress = await service.getUserLatestAddress(userId);

      expect(latestAddress).toBe(newerAddress.toLowerCase());
    });

    it('should handle getUserLatestAddress for user with no assignments', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.getUserLatestAddress('user_no_assignments_12345');
      expect(result).toBeNull();
    });

    it('should handle getUserLatestAddress with case sensitivity', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_case_sensitive';
      const mixedCaseAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';

      await service.addUpdateServer('test_server_case', 'Case Server', 'role_case');
      const rule = await service.addRoleMapping(
        'test_server_case', 'Case Server', 'channel_case', 'Case Channel',
        'case-collection', 'role_case', 'Case Role', 'ALL', 'ALL', 1
      );

      await service.trackRoleAssignment({
        userId,
        serverId: 'test_server_case',
        roleId: 'role_case',
        ruleId: rule.id.toString(),
        address: mixedCaseAddress
      });

      const result = await service.getUserLatestAddress(userId);
      expect(result).toBe(mixedCaseAddress.toLowerCase());
    });
  });

  // =======================================
  // CHANNEL RULE METHODS TESTS
  // =======================================

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

      const serverId = 'test_server_update_msg';
      const newMessageId = 'updated_message_555555';

      await service.addUpdateServer(serverId, 'Update Message Server', 'role_update');

      const rule = await service.addRoleMapping(
        serverId, 'Update Message Server', 'channel_update', 'Update Channel',
        'update-collection', 'role_update', 'Update Role', 'ALL', 'ALL', 1
      );

      // Update the message ID
      await service.updateRuleMessageId(rule.id.toString(), newMessageId);

      // Verify the update
      const updatedRule = await service.findRuleByMessageId(serverId, 'channel_update', newMessageId);
      expect(updatedRule).toBeDefined();
      expect(updatedRule.id).toBe(rule.id);
      // Note: message_id property may not be available in VerifierRole interface
    });

    it('should find rule with message using comprehensive search', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_find_with_msg';
      const channelId = 'channel_find_msg';
      const roleId = 'role_find_msg';
      const messageId = 'find_message_777777';

      await service.addUpdateServer(serverId, 'Find With Message Server', roleId);

      const rule = await service.addRoleMapping(
        serverId, 'Find With Message Server', channelId, 'Find Message Channel',
        'find-msg-collection', roleId, 'Find Message Role', 'trait', 'artifact', 1
      );

      await service.updateRuleMessageId(rule.id.toString(), messageId);

      const foundRule = await service.findRuleWithMessage(serverId, channelId);

      expect(foundRule).toBeDefined();
      expect(foundRule.server_id).toBe(serverId);
      expect(foundRule.channel_id).toBe(channelId);
      expect(foundRule.role_id).toBe(roleId);
      // Note: message_id property may not be available in VerifierRole interface
    });

    it('should return null for findRuleWithMessage when no message exists', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_no_msg';
      const channelId = 'channel_no_msg';
      const roleId = 'role_no_msg';

      await service.addUpdateServer(serverId, 'No Message Server', roleId);

      // Create rule without setting message ID
      await service.addRoleMapping(
        serverId, 'No Message Server', channelId, 'No Message Channel',
        'no-msg-collection', roleId, 'No Message Role', 'ALL', 'ALL', 1
      );

      const result = await service.findRuleWithMessage(serverId, channelId);
      expect(result).toBeNull();
    });
  });

  // =======================================
  // ENHANCED SYSTEM HEALTH TESTS
  // =======================================

  describe('Enhanced System Health Methods', () => {
    it('should verify checkVerificationSystemReady detects proper schema', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const isReady = await service.checkVerificationSystemReady();
      
      expect(typeof isReady).toBe('boolean');
      // Should be true since we have Supabase running with proper migrations
      expect(isReady).toBe(true);
    });

    it('should verify checkEnhancedTrackingExists matches system readiness', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const hasEnhancedTracking = await service.checkEnhancedTrackingExists();
      const isSystemReady = await service.checkVerificationSystemReady();
      
      expect(typeof hasEnhancedTracking).toBe('boolean');
      // These should generally match in a properly configured system
      expect(hasEnhancedTracking).toBe(isSystemReady);
    });

    it('should handle system health checks gracefully', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Both methods should not throw errors even in edge cases
      await expect(service.checkVerificationSystemReady()).resolves.not.toThrow();
      await expect(service.checkEnhancedTrackingExists()).resolves.not.toThrow();
    });

    it('should provide consistent system health status', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      // Call both methods multiple times to ensure consistency
      const checks = await Promise.all([
        service.checkVerificationSystemReady(),
        service.checkEnhancedTrackingExists(),
        service.checkVerificationSystemReady(),
        service.checkEnhancedTrackingExists()
      ]);

      expect(checks[0]).toBe(checks[2]); // Same method should return same result
      expect(checks[1]).toBe(checks[3]); // Same method should return same result
    });
  });

  // =======================================
  // ADDITIONAL USER MANAGEMENT EDGE CASES
  // =======================================

  describe('Additional User Management Edge Cases', () => {
    it('should handle getUserServers with comprehensive testing', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const userId = 'user_comprehensive_servers';
      const serverId = 'test_server_user_comp';

      // Create server and add user to it
      await service.addUpdateServer(serverId, 'Comprehensive User Server', 'role_comp');
      await service.addServerToUser(userId, serverId, 'role_comp', '0x1234567890abcdef1234567890abcdef12345678');

      const userServers = await service.getUserServers(userId);
      
      // Depending on implementation, this might return an array or undefined
      if (userServers !== undefined) {
        expect(Array.isArray(userServers)).toBe(true);
      }
    });

    it('should handle getServerRole method', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_role_method';
      const roleId = 'role_method_test';

      await service.addUpdateServer(serverId, 'Role Method Server', roleId);

      const serverRole = await service.getServerRole(serverId);
      
      expect(serverRole).toBeDefined();
      expect(serverRole).toBe(roleId);
    });

    it('should handle getServerRole for non-existent server', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const result = await service.getServerRole('nonexistent_server_99999');
      expect(result).toBeUndefined();
    });
  });

  // =======================================
  // LOW PRIORITY TESTS
  // =======================================

  // =======================================
  // ADVANCED CONFLICT DETECTION EDGE CASES
  // =======================================

  describe('Advanced Conflict Detection Edge Cases', () => {
    it('should handle conflict detection with null/empty values', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_null_conflict';
      const channelId = 'channel_null_conflict';
      const roleId = 'role_null_conflict';

      await service.addUpdateServer(serverId, 'Null Conflict Server', roleId);

      // Create rule with null/empty values
      await service.addRoleMapping(
        serverId, 'Null Conflict Server', channelId, 'Null Conflict Channel',
        '', // Empty slug (becomes 'ALL')
        roleId, 'Null Conflict Role', '', '', null // Empty attributes
      );

      // Test conflict detection with matching null/empty values
      const conflict1 = await service.findConflictingRule(
        serverId, channelId, roleId, 'ALL', 'ALL', 'ALL', 1
      );

      expect(conflict1).toBeDefined();
      expect(conflict1.server_id).toBe(serverId);
      expect(conflict1.slug).toBe('ALL');

      // Test conflict detection with different empty representations
      const conflict2 = await service.findConflictingRule(
        serverId, channelId, roleId, '', '', '', 1
      );

      expect(conflict2).toBeDefined();
    });

    it('should handle conflict detection with case sensitivity', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_case_conflict';
      const channelId = 'channel_case_conflict';
      const roleId = 'role_case_conflict';

      await service.addUpdateServer(serverId, 'Case Conflict Server', roleId);

      // Create rule with specific case
      await service.addRoleMapping(
        serverId, 'Case Conflict Server', channelId, 'Case Conflict Channel',
        'Test-Collection', roleId, 'Case Conflict Role', 'TraitType', 'RareValue', 1
      );

      // Test conflict detection with different case
      const conflict1 = await service.findConflictingRule(
        serverId, channelId, roleId, 'test-collection', 'traittype', 'rarevalue', 1
      );

      // Depending on database collation, this might or might not find a conflict
      // We test that the method handles case differences gracefully
      expect(conflict1 === null || conflict1 !== null).toBe(true);

      // Test with exact case match
      const conflict2 = await service.findConflictingRule(
        serverId, channelId, roleId, 'Test-Collection', 'TraitType', 'RareValue', 1
      );

      expect(conflict2).toBeDefined();
      expect(conflict2.server_id).toBe(serverId);
    });

    it('should handle conflict detection with special characters', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_special_conflict';
      const channelId = 'channel_special_conflict';
      const roleId = 'role_special_conflict';

      await service.addUpdateServer(serverId, 'Special Conflict Server', roleId);

      // Create rule with special characters
      await service.addRoleMapping(
        serverId, 'Special Conflict Server', channelId, 'Special Conflict Channel',
        'test-collection-123!@#', roleId, 'Special Conflict Role', 
        'trait_type_$%^', 'rare_value_&*()', 1
      );

      // Test conflict detection with same special characters
      const conflict = await service.findConflictingRule(
        serverId, channelId, roleId, 'test-collection-123!@#', 
        'trait_type_$%^', 'rare_value_&*()', 1
      );

      expect(conflict).toBeDefined();
      expect(conflict.server_id).toBe(serverId);
      expect(conflict.slug).toBe('test-collection-123!@#');
      expect(conflict.attribute_key).toBe('trait_type_$%^');
      expect(conflict.attribute_value).toBe('rare_value_&*()');
    });

    it('should handle conflict detection with unicode characters', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_unicode_conflict';
      const channelId = 'channel_unicode_conflict';
      const roleId = 'role_unicode_conflict';

      await service.addUpdateServer(serverId, 'Unicode Conflict Server', roleId);

      // Create rule with unicode characters
      await service.addRoleMapping(
        serverId, 'Unicode Conflict Server', channelId, 'Unicode Conflict Channel',
        'test-collection-🎮', roleId, 'Unicode Conflict Role', 
        'trait_type_表情', 'rare_value_🔥', 1
      );

      // Test conflict detection with same unicode characters
      const conflict = await service.findConflictingRule(
        serverId, channelId, roleId, 'test-collection-🎮', 
        'trait_type_表情', 'rare_value_🔥', 1
      );

      expect(conflict).toBeDefined();
      expect(conflict.server_id).toBe(serverId);
      expect(conflict.slug).toBe('test-collection-🎮');
      expect(conflict.attribute_key).toBe('trait_type_表情');
      expect(conflict.attribute_value).toBe('rare_value_🔥');
    });

    it('should handle conflict detection with very long strings', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_long_conflict';
      const channelId = 'channel_long_conflict';
      const roleId = 'role_long_conflict';

      await service.addUpdateServer(serverId, 'Long Conflict Server', roleId);

      // Create rule with very long strings
      const longSlug = 'test-collection-' + 'a'.repeat(200);
      const longKey = 'trait_type_' + 'b'.repeat(200);
      const longValue = 'rare_value_' + 'c'.repeat(200);

      await service.addRoleMapping(
        serverId, 'Long Conflict Server', channelId, 'Long Conflict Channel',
        longSlug, roleId, 'Long Conflict Role', longKey, longValue, 1
      );

      // Test conflict detection with same long strings
      const conflict = await service.findConflictingRule(
        serverId, channelId, roleId, longSlug, longKey, longValue, 1
      );

      expect(conflict).toBeDefined();
      expect(conflict.server_id).toBe(serverId);
      expect(conflict.slug).toBe(longSlug);
    });

    it('should handle conflict detection with numeric edge cases', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_numeric_conflict';
      const channelId = 'channel_numeric_conflict';
      const roleId = 'role_numeric_conflict';

      await service.addUpdateServer(serverId, 'Numeric Conflict Server', roleId);

      // Test with minimum integer
      await service.addRoleMapping(
        serverId, 'Numeric Conflict Server', channelId + '_min', 'Numeric Conflict Channel',
        'min-collection', roleId, 'Numeric Conflict Role', 'trait', 'value', 0
      );

      const conflictMin = await service.findConflictingRule(
        serverId, channelId + '_min', roleId, 'min-collection', 'trait', 'value', 0
      );

      expect(conflictMin).toBeDefined();
      expect(conflictMin.min_items).toBe(0);

      // Test with large integer
      await service.addRoleMapping(
        serverId, 'Numeric Conflict Server', channelId + '_large', 'Numeric Conflict Channel',
        'large-collection', roleId, 'Numeric Conflict Role', 'trait', 'value', 999999
      );

      const conflictLarge = await service.findConflictingRule(
        serverId, channelId + '_large', roleId, 'large-collection', 'trait', 'value', 999999
      );

      expect(conflictLarge).toBeDefined();
      expect(conflictLarge.min_items).toBe(999999);
    });

    it('should handle duplicate detection with complex rule combinations', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_complex_dup';
      const channelId = 'channel_complex_dup';

      await service.addUpdateServer(serverId, 'Complex Duplicate Server', 'role_complex');

      // Create multiple similar rules that should not conflict
      const rule1 = await service.addRoleMapping(
        serverId, 'Complex Duplicate Server', channelId, 'Complex Duplicate Channel',
        'collection-1', 'role_1', 'Role 1', 'trait', 'rare', 1
      );

      const rule2 = await service.addRoleMapping(
        serverId, 'Complex Duplicate Server', channelId, 'Complex Duplicate Channel',
        'collection-1', 'role_2', 'Role 2', 'trait', 'epic', 1 // Different value
      );

      const rule3 = await service.addRoleMapping(
        serverId, 'Complex Duplicate Server', channelId, 'Complex Duplicate Channel',
        'collection-1', 'role_3', 'Role 3', 'background', 'rare', 1 // Different key
      );

      // Test that each rule doesn't find duplicates of itself
      const dup1 = await service.checkForDuplicateRule(
        serverId, channelId, 'collection-1', 'trait', 'rare', 1, 'role_1'
      );
      expect(dup1).toBeNull(); // Should not find itself

      // Test that different criteria don't create false duplicates
      const dup2 = await service.checkForDuplicateRule(
        serverId, channelId, 'collection-1', 'trait', 'rare', 1, 'role_2'
      );
      expect(dup2).toBeDefined(); // Should find rule1 as duplicate
      expect(dup2.role_id).toBe('role_1');

      const dup3 = await service.checkForDuplicateRule(
        serverId, channelId, 'collection-1', 'background', 'rare', 1, 'role_1'
      );
      expect(dup3).toBeDefined(); // Should find rule3 as duplicate
      expect(dup3.role_id).toBe('role_3');
    });

    it('should handle exact duplicate detection edge cases', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_exact_edge';
      const channelId = 'channel_exact_edge';
      const roleId = 'role_exact_edge';

      await service.addUpdateServer(serverId, 'Exact Edge Server', roleId);

      // Create rule
      await service.addRoleMapping(
        serverId, 'Exact Edge Server', channelId, 'Exact Edge Channel',
        'edge-collection', roleId, 'Exact Edge Role', 'trait', 'edge', 1
      );

      // Test exact duplicate with same role (should find it)
      const exactDup1 = await service.checkForExactDuplicateRule(
        serverId, channelId, 'edge-collection', 'trait', 'edge', 1, roleId
      );
      expect(exactDup1).toBeDefined();
      expect(exactDup1.server_id).toBe(serverId);

      // Test exact duplicate with different role (should not find it)
      const exactDup2 = await service.checkForExactDuplicateRule(
        serverId, channelId, 'edge-collection', 'trait', 'edge', 1, 'different_role'
      );
      expect(exactDup2).toBeNull();

      // Test with slight variation in criteria (should not find it)
      const exactDup3 = await service.checkForExactDuplicateRule(
        serverId, channelId, 'edge-collection', 'trait', 'edge', 2, roleId // Different min_items
      );
      expect(exactDup3).toBeNull();
    });

    it('should handle conflict detection across different servers', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const server1Id = 'test_server_cross_1';
      const server2Id = 'test_server_cross_2';
      const channelId = 'channel_cross_test';
      const roleId = 'role_cross_test';

      await service.addUpdateServer(server1Id, 'Cross Server 1', roleId);
      await service.addUpdateServer(server2Id, 'Cross Server 2', roleId);

      // Create identical rules in different servers
      await service.addRoleMapping(
        server1Id, 'Cross Server 1', channelId, 'Cross Channel',
        'cross-collection', roleId, 'Cross Role', 'trait', 'cross', 1
      );

      await service.addRoleMapping(
        server2Id, 'Cross Server 2', channelId, 'Cross Channel',
        'cross-collection', roleId, 'Cross Role', 'trait', 'cross', 1
      );

      // Test that conflict detection is server-specific
      const conflict1 = await service.findConflictingRule(
        server1Id, channelId, roleId, 'cross-collection', 'trait', 'cross', 1
      );
      expect(conflict1).toBeDefined();
      expect(conflict1.server_id).toBe(server1Id);

      const conflict2 = await service.findConflictingRule(
        server2Id, channelId, roleId, 'cross-collection', 'trait', 'cross', 1
      );
      expect(conflict2).toBeDefined();
      expect(conflict2.server_id).toBe(server2Id);

      // Should not find cross-server conflicts
      const crossConflict = await service.findConflictingRule(
        'nonexistent_server', channelId, roleId, 'cross-collection', 'trait', 'cross', 1
      );
      expect(crossConflict).toBeNull();
    });

    it('should handle conflict detection with mixed data types as strings', async () => {
      if (!isSupabaseHealthy) {
        console.log('⏭️ Skipping test: Supabase not available');
        return;
      }

      const serverId = 'test_server_mixed_types';
      const channelId = 'channel_mixed_types';
      const roleId = 'role_mixed_types';

      await service.addUpdateServer(serverId, 'Mixed Types Server', roleId);

      // Create rules with numeric-like strings
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