import { Test, TestingModule } from '@nestjs/testing';

// Mock dotenv to prevent real config loading
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Set up environment variables to prevent the service from throwing
process.env.DB_SUPABASE_URL = 'http://localhost:3000';
process.env.DB_SUPABASE_KEY = 'test-key';

// Create a comprehensive mock for Supabase operations
const createMockQuery = () => {
  // Queue of results for sequential calls
  let resultQueue = [{ data: [], error: null }];
  let currentIndex = 0;
  
  const mockQuery = {
    select: jest.fn(),
    from: jest.fn(),
    upsert: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    eq: jest.fn(),
    neq: jest.fn(),
    not: jest.fn(),
    limit: jest.fn(),
    single: jest.fn(),
    // Make the query awaitable by inheriting from Promise
    then: jest.fn((onFulfilled, onRejected) => {
      const result = resultQueue[Math.min(currentIndex, resultQueue.length - 1)];
      currentIndex++;
      return Promise.resolve(result).then(onFulfilled, onRejected);
    }),
    catch: jest.fn((onRejected) => Promise.resolve().catch(onRejected)),
    // Helper to set the promise result
    setResult: (result) => {
      resultQueue = [result];
      currentIndex = 0;
    },
    // Helper to set multiple results for sequential calls
    setResults: (results) => {
      resultQueue = results;
      currentIndex = 0;
    },
    // Reset the call counter
    resetIndex: () => {
      currentIndex = 0;
    }
  };
  
  // Each method returns the same mock object to allow chaining
  mockQuery.select.mockReturnValue(mockQuery);
  mockQuery.from.mockReturnValue(mockQuery);
  mockQuery.upsert.mockReturnValue(mockQuery);
  mockQuery.insert.mockReturnValue(mockQuery);
  mockQuery.update.mockReturnValue(mockQuery);
  mockQuery.delete.mockReturnValue(mockQuery);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.neq.mockReturnValue(mockQuery);
  mockQuery.not.mockReturnValue(mockQuery);
  mockQuery.limit.mockReturnValue(mockQuery);
  mockQuery.single.mockReturnValue(mockQuery);
  
  return mockQuery;
};

let mockSupabaseQuery = createMockQuery();

const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseQuery)
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

import { DbService } from '../src/services/db.service';

describe('DbService - Unit Tests', () => {
  let service: DbService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create a fresh mock query for each test
    mockSupabaseQuery = createMockQuery();
    mockSupabaseClient.from.mockReturnValue(mockSupabaseQuery);
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addUpdateServer', () => {
    it('should create/update a server successfully', async () => {
      mockSupabaseQuery.setResult({ data: [{ id: 'server1' }], error: null });
      
      const result = await service.addUpdateServer('server1', 'Test Server', 'role1');
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('verifier_servers');
      expect(mockSupabaseQuery.upsert).toHaveBeenCalledWith({
        id: 'server1',
        name: 'Test Server',
        role_id: 'role1'
      });
      expect(result).toEqual([{ id: 'server1' }]);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'Database error' } });
      
      await expect(service.addUpdateServer('server1', 'Test Server', 'role1'))
        .rejects.toEqual({ message: 'Database error' });
    });
  });

  describe('getUserServers', () => {
    it('should return user server data', async () => {
      const mockUserData = { user_id: 'user1', servers: { server1: 'role1' } };
      mockSupabaseQuery.setResult({ data: [mockUserData], error: null });
      
      const result = await service.getUserServers('user1');
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('verifier_users');
      expect(mockSupabaseQuery.select).toHaveBeenCalledWith('*');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('user_id', 'user1');
      expect(result).toEqual(mockUserData);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'User fetch error' } });
      
      await expect(service.getUserServers('user1'))
        .rejects.toEqual({ message: 'User fetch error' });
    });
  });

  describe('addServerToUser', () => {
    it('should add server to user with existing servers', async () => {
      // Mock the fetch call first
      const existingData = { servers: { server1: 'role1' } };
      mockSupabaseQuery.setResults([
        { data: [existingData], error: null },
        { data: [{ user_id: 'user1' }], error: null }
      ]);
      
      const result = await service.addServerToUser('user1', 'server2', 'role2', '0xABC123');
      
      expect(mockSupabaseQuery.upsert).toHaveBeenCalledWith({
        user_id: 'user1',
        address: '0xabc123',
        servers: { server1: 'role1', server2: 'role2' }
      }, {
        onConflict: 'user_id'
      });
      expect(result).toEqual([{ user_id: 'user1' }]);
    });

    it('should handle new user with no existing servers', async () => {
      mockSupabaseQuery.setResults([
        { data: [{}], error: null },
        { data: [{ user_id: 'user1' }], error: null }
      ]);
      
      const result = await service.addServerToUser('user1', 'server1', 'role1', '0xABC123');
      
      expect(mockSupabaseQuery.upsert).toHaveBeenCalledWith({
        user_id: 'user1',
        address: '0xabc123',
        servers: { server1: 'role1' }
      }, {
        onConflict: 'user_id'
      });
    });

    it('should handle fetch errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'Fetch error' } });
      
      await expect(service.addServerToUser('user1', 'server1', 'role1', '0xABC123'))
        .rejects.toEqual({ message: 'Fetch error' });
    });
  });

  describe('getServerRole', () => {
    it('should return role_id for server', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ role_id: 'role123' }], 
        error: null 
      });
      
      const result = await service.getServerRole('server1');
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('verifier_servers');
      expect(mockSupabaseQuery.select).toHaveBeenCalledWith('role_id');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('id', 'server1');
      expect(result).toBe('role123');
    });

    it('should return undefined for non-existent server', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.getServerRole('nonexistent');
      
      expect(result).toBeUndefined();
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'Server error' } });
      
      await expect(service.getServerRole('server1'))
        .rejects.toEqual({ message: 'Server error' });
    });
  });

  describe('checkForDuplicateRule', () => {
    it('should find duplicate rule with different role', async () => {
      const mockRule = {
        id: 1,
        server_id: 'server1',
        channel_id: 'channel1',
        slug: 'collection1',
        role_id: 'other-role'
      };
      mockSupabaseQuery.setResult({ data: [mockRule], error: null });
      
      const result = await service.checkForDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1, 'current-role'
      );
      
      expect(result).toEqual(mockRule);
      expect(mockSupabaseQuery.neq).toHaveBeenCalledWith('role_id', 'current-role');
    });

    it('should return null when no duplicate found', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.checkForDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1
      );
      
      expect(result).toBeNull();
    });

    it('should handle default values properly', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      await service.checkForDuplicateRule('server1', 'channel1', '', '', '', null);
      
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('slug', 'ALL');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('attribute_key', 'ALL');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('attribute_value', 'ALL');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('min_items', 1);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Database query error' } 
      });
      
      await expect(service.checkForDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1
      )).rejects.toEqual({ message: 'Database query error' });
    });
  });

  describe('addRoleMapping', () => {
    it('should add role mapping with all parameters', async () => {
      const mockResult = {
        id: 1,
        server_id: 'server1',
        slug: 'collection1',
        min_items: 2
      };
      mockSupabaseQuery.setResult({ data: mockResult, error: null });
      
      const result = await service.addRoleMapping(
        'server1', 'Server Name', 'channel1', 'Channel Name',
        'collection1', 'role1', 'Role Name', 'trait', 'value', 2
      );
      
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith({
        server_id: 'server1',
        server_name: 'Server Name',
        channel_id: 'channel1',
        channel_name: 'Channel Name',
        slug: 'collection1',
        role_id: 'role1',
        role_name: 'Role Name',
        attribute_key: 'trait',
        attribute_value: 'value',
        min_items: 2
      });
      expect(result).toEqual(mockResult);
    });

    it('should use default values for empty parameters', async () => {
      mockSupabaseQuery.setResult({ data: {}, error: null });
      
      await service.addRoleMapping(
        'server1', 'Server Name', 'channel1', 'Channel Name',
        '', 'role1', 'Role Name', '', '', null
      );
      
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith({
        server_id: 'server1',
        server_name: 'Server Name',
        channel_id: 'channel1',
        channel_name: 'Channel Name',
        slug: 'ALL',
        role_id: 'role1',
        role_name: 'Role Name',
        attribute_key: 'ALL',
        attribute_value: 'ALL',
        min_items: 1
      });
    });
  });

  describe('getRoleMappings', () => {
    it('should get all role mappings for server', async () => {
      const mockRules = [
        { id: 1, server_id: 'server1', channel_id: 'channel1' },
        { id: 2, server_id: 'server1', channel_id: 'channel2' }
      ];
      mockSupabaseQuery.setResult({ data: mockRules, error: null });
      
      const result = await service.getRoleMappings('server1');
      
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('server_id', 'server1');
      expect(result).toEqual(mockRules);
    });

    it('should filter by channel when provided', async () => {
      const mockRules = [{ id: 1, server_id: 'server1', channel_id: 'channel1' }];
      mockSupabaseQuery.setResult({ data: mockRules, error: null });
      
      const result = await service.getRoleMappings('server1', 'channel1');
      
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('server_id', 'server1');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('channel_id', 'channel1');
      expect(result).toEqual(mockRules);
    });
  });

  describe('deleteRoleMapping', () => {
    it('should delete rule that belongs to server', async () => {
      mockSupabaseQuery.setResults([
        { data: [{ server_id: 'server1' }], error: null },
        { data: null, error: null }
      ]);
      
      await service.deleteRoleMapping('rule1', 'server1');
      
      expect(mockSupabaseQuery.delete).toHaveBeenCalled();
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('id', 'rule1');
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('server_id', 'server1');
    });

    it('should throw error if rule does not belong to server', async () => {
      mockSupabaseQuery.setResult({ data: [{ server_id: 'other-server' }], error: null });
      
      await expect(service.deleteRoleMapping('rule1', 'server1'))
        .rejects.toThrow('Rule does not belong to this server');
    });

    it('should throw error if rule does not exist', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      await expect(service.deleteRoleMapping('rule1', 'server1'))
        .rejects.toThrow('Rule does not belong to this server');
    });
  });

  describe('logUserRole', () => {
    it('should log user role assignment with all details', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      
      await service.logUserRole(
        'user1', 'server1', 'role1', '0xABC123',
        'TestUser', 'TestServer', 'TestRole'
      );
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('verifier_user_roles');
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith({
        user_id: 'user1',
        server_id: 'server1',
        role_id: 'role1',
        address: '0xabc123',
        assigned_at: expect.any(String),
        user_name: 'TestUser',
        server_name: 'TestServer',
        role_name: 'TestRole'
      });
    });

    it('should handle null optional parameters', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      
      await service.logUserRole('user1', 'server1', 'role1', '0xABC123');
      
      expect(mockSupabaseQuery.insert).toHaveBeenCalledWith({
        user_id: 'user1',
        server_id: 'server1',
        role_id: 'role1',
        address: '0xabc123',
        assigned_at: expect.any(String),
        user_name: null,
        server_name: null,
        role_name: null
      });
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'Log error' } });
      
      await expect(service.logUserRole('user1', 'server1', 'role1', '0xABC123'))
        .rejects.toEqual({ message: 'Log error' });
    });
  });

  describe('getAllRulesWithLegacy', () => {
    it('should return rules and legacy role when both exist', async () => {
      const mockRules = [{ id: 1, server_id: 'server1' }];
      const mockLegacy = [{ role_id: 'legacy-role', name: 'Legacy Server' }];
      
      mockSupabaseQuery.setResults([
        { data: mockRules, error: null },
        { data: mockLegacy, error: null }
      ]);
      
      const result = await service.getAllRulesWithLegacy('server1');
      
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockRules[0]);
      expect(result[1]).toEqual({
        id: 'LEGACY',
        channel_id: '-',
        role_id: 'legacy-role',
        slug: null,
        attribute_key: null,
        attribute_value: null,
        min_items: null,
        legacy: true,
        server_name: 'Legacy Server'
      });
    });

    it('should return only rules when no legacy role exists', async () => {
      const mockRules = [{ id: 1, server_id: 'server1' }];
      
      mockSupabaseQuery.setResults([
        { data: mockRules, error: null },
        { data: [], error: null }
      ]);
      
      const result = await service.getAllRulesWithLegacy('server1');
      
      expect(result).toEqual(mockRules);
    });
  });

  describe('removeAllLegacyRoles', () => {
    it('should remove legacy roles and return removed list', async () => {
      const mockLegacyRoles = [{ role_id: 'legacy1', name: 'Legacy Role 1' }];
      
      mockSupabaseQuery.setResults([
        { data: mockLegacyRoles, error: null },
        { data: null, error: null }
      ]);
      
      const result = await service.removeAllLegacyRoles('server1');
      
      expect(mockSupabaseQuery.delete).toHaveBeenCalled();
      expect(result).toEqual({ removed: mockLegacyRoles });
    });

    it('should return empty array when no legacy roles exist', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.removeAllLegacyRoles('server1');
      
      expect(result).toEqual({ removed: [] });
    });
  });

  describe('getLegacyRoles', () => {
    it('should return legacy roles data', async () => {
      const mockData = [{ role_id: 'legacy1', name: 'Legacy Role' }];
      mockSupabaseQuery.setResult({ data: mockData, error: null });
      
      const result = await service.getLegacyRoles('server1');
      
      expect(result).toEqual({ data: mockData, error: null });
    });
  });

  describe('ruleExists', () => {
    it('should return true when rule exists', async () => {
      mockSupabaseQuery.setResult({ data: [{ id: 1 }], error: null });
      
      const result = await service.ruleExists('server1', 'channel1', 'role1', 'collection1');
      
      expect(result).toBe(true);
    });

    it('should return false when rule does not exist', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.ruleExists('server1', 'channel1', 'role1', 'collection1');
      
      expect(result).toBe(false);
    });
  });

  describe('findRuleWithMessage', () => {
    it('should return rule with message_id', async () => {
      const mockRule = { id: 1, message_id: 'msg123' };
      mockSupabaseQuery.setResult({ data: [mockRule], error: null });
      
      const result = await service.findRuleWithMessage('server1', 'channel1');
      
      expect(mockSupabaseQuery.not).toHaveBeenCalledWith('message_id', 'is', null);
      expect(mockSupabaseQuery.limit).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockRule);
    });

    it('should return null when no rule with message found', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.findRuleWithMessage('server1', 'channel1');
      
      expect(result).toBeNull();
    });
  });

  describe('updateRuleMessageId', () => {
    it('should update message_id for rule', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      
      await service.updateRuleMessageId(1, 'msg123');
      
      expect(mockSupabaseQuery.update).toHaveBeenCalledWith({ message_id: 'msg123' });
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('id', 1);
    });

    it('should handle update errors', async () => {
      mockSupabaseQuery.setResult({ data: null, error: { message: 'Update error' } });
      
      await expect(service.updateRuleMessageId(1, 'msg123'))
        .rejects.toEqual({ message: 'Update error' });
    });
  });

  describe('findRuleByMessageId', () => {
    it('should find rule by message_id', async () => {
      const mockRule = { id: 1, message_id: 'msg123' };
      mockSupabaseQuery.setResult({ data: [mockRule], error: null });
      
      const result = await service.findRuleByMessageId('server1', 'channel1', 'msg123');
      
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('message_id', 'msg123');
      expect(result).toEqual(mockRule);
    });

    it('should return null when no rule found', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.findRuleByMessageId('server1', 'channel1', 'msg123');
      
      expect(result).toBeNull();
    });
  });

  describe('findRulesByMessageId', () => {
    it('should find all rules by message_id', async () => {
      const mockRules = [
        { id: 1, message_id: 'msg123' },
        { id: 2, message_id: 'msg123' }
      ];
      mockSupabaseQuery.setResult({ data: mockRules, error: null });
      
      const result = await service.findRulesByMessageId('server1', 'channel1', 'msg123');
      
      expect(result).toEqual(mockRules);
    });

    it('should return empty array when no rules found', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      
      const result = await service.findRulesByMessageId('server1', 'channel1', 'msg123');
      
      expect(result).toEqual([]);
    });
  });

  describe('getRulesByChannel', () => {
    it('should get all rules for channel', async () => {
      const mockRules = [{ id: 1, channel_id: 'channel1' }];
      mockSupabaseQuery.setResult({ data: mockRules, error: null });
      
      const result = await service.getRulesByChannel('server1', 'channel1');
      
      expect(result).toEqual(mockRules);
    });

    it('should return empty array when no rules found', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      
      const result = await service.getRulesByChannel('server1', 'channel1');
      
      expect(result).toEqual([]);
    });
  });

  describe('findConflictingRule', () => {
    it('should find conflicting rule', async () => {
      const mockRule = { id: 1, role_id: 'role1' };
      mockSupabaseQuery.setResult({ data: mockRule, error: null });
      
      const result = await service.findConflictingRule(
        'server1', 'channel1', 'role1', 'collection1', 'trait', 'value', 1
      );
      
      expect(mockSupabaseQuery.single).toHaveBeenCalled();
      expect(result).toEqual(mockRule);
    });

    it('should handle no conflict found (PGRST116 error)', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { code: 'PGRST116', message: 'No rows found' } 
      });
      
      const result = await service.findConflictingRule(
        'server1', 'channel1', 'role1', 'collection1', 'trait', 'value', 1
      );
      
      expect(result).toBeNull();
    });

    it('should throw other database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { code: 'OTHER_ERROR', message: 'Database error' } 
      });
      
      await expect(service.findConflictingRule(
        'server1', 'channel1', 'role1', 'collection1', 'trait', 'value', 1
      )).rejects.toEqual({ code: 'OTHER_ERROR', message: 'Database error' });
    });
  });

  describe('checkForExactDuplicateRule', () => {
    it('should find exact duplicate rule', async () => {
      const mockRule = { id: 1, role_id: 'role1' };
      mockSupabaseQuery.setResult({ data: [mockRule], error: null });
      
      const result = await service.checkForExactDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1, 'role1'
      );
      
      expect(mockSupabaseQuery.eq).toHaveBeenCalledWith('role_id', 'role1');
      expect(result).toEqual(mockRule);
    });

    it('should return null when no exact duplicate found', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      
      const result = await service.checkForExactDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1, 'role1'
      );
      
      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Database error' } 
      });
      
      await expect(service.checkForExactDuplicateRule(
        'server1', 'channel1', 'collection1', 'trait', 'value', 1, 'role1'
      )).rejects.toEqual({ message: 'Database error' });
    });
  });
});
