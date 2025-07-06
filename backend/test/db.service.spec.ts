import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../src/services/db.service';
import { TestDatabase } from './test-database';

describe('DbService - Integration Tests', () => {
  let service: DbService;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = TestDatabase.getInstance();
    
    // Check if local Supabase is running
    const isHealthy = await testDb.isHealthy();
    if (!isHealthy) {
      console.warn('⚠️  Local Supabase not accessible. Skipping integration tests.');
      return;
    }
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
    
    // Clean up test data before each test
    await testDb.cleanupTestData();
  });

  afterEach(async () => {
    // Clean up test data after each test
    await testDb.cleanupTestData();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addUpdateServer', () => {
    it('should create a new server', async () => {
      const result = await service.addUpdateServer(
        'test_server_new', 
        'Test Server New', 
        'test_role_new'
      );

      expect(result).toBeDefined();
      // Note: Supabase upsert might return null on success
    });

    it('should update existing server', async () => {
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
      // Create a test server first
      await testDb.createTestServer('test_server_mapping');
    });

    it('should add role mapping with all parameters', async () => {
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
      await testDb.createTestServer('test_server_get');
      await testDb.createTestRule('test_server_get');
    });

    it('should return role mappings for server', async () => {
      const result = await service.getRoleMappings('test_server_get');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].server_id).toBe('test_server_get');
    });

    it('should filter by channel when provided', async () => {
      const result = await service.getRoleMappings('test_server_get', 'test_channel_123');

      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].channel_id).toBe('test_channel_123');
      }
    });
  });

  describe('ruleExists', () => {
    beforeEach(async () => {
      await testDb.createTestServer('test_server_exists');
      await testDb.createTestRule('test_server_exists');
    });

    it('should return true when rule exists', async () => {
      const result = await service.ruleExists(
        'test_server_exists',
        'test_channel_123',
        'test_role_123',
        'test-collection'
      );

      expect(result).toBe(true);
    });

    it('should return false when rule does not exist', async () => {
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
      const result = await service.getUserServers('test_user_nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('logUserRole', () => {
    it('should log user role assignment', async () => {
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      expect(typeof service.addUpdateServer).toBe('function');
      expect(typeof service.getUserServers).toBe('function');
      expect(typeof service.addServerToUser).toBe('function');
      expect(typeof service.getServerRole).toBe('function');
      expect(typeof service.addRoleMapping).toBe('function');
      expect(typeof service.getRoleMappings).toBe('function');
      expect(typeof service.deleteRoleMapping).toBe('function');
      expect(typeof service.logUserRole).toBe('function');
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
    });
  });

  describe('checkForDuplicateRule', () => {
    it('should find existing rule with same criteria for different role', async () => {
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
      const isHealthy = await testDb.isHealthy();
      if (!isHealthy) {
        console.warn('⚠️  Local Supabase not accessible. Skipping test.');
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
});
