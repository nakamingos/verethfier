import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../src/services/db.service';

// Mock the entire @supabase/supabase-js module before any imports
jest.mock('@supabase/supabase-js', () => {
  const mockSingle = jest.fn();
  const mockSelect = jest.fn(() => ({ single: mockSingle }));
  const mockInsert = jest.fn(() => ({ select: mockSelect }));
  const mockFrom = jest.fn(() => ({ insert: mockInsert }));
  
  return {
    createClient: jest.fn(() => ({ from: mockFrom }))
  };
});

describe('DbService', () => {
  let service: DbService;
  let mockSupabase: any;

  beforeEach(async () => {
    // Get references to the mocked functions
    const { createClient } = require('@supabase/supabase-js');
    mockSupabase = createClient();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up successful response for all tests by default
    mockSupabase.from().insert().select().single.mockResolvedValue({
      data: { id: 1 },
      error: null
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  describe('addRoleMapping', () => {
    it('should transform null values to defaults', async () => {
      await service.addRoleMapping(
        'server-id',
        'server-name', 
        'channel-id',
        'channel-name',
        null, // slug
        'role-id',
        'Test Role', // roleName
        null, // attrKey
        null, // attrVal
        null  // minItems
      );

      // Verify insert was called with transformed values
      expect(mockSupabase.from().insert).toHaveBeenCalledWith({
        server_id: 'server-id',
        server_name: 'server-name',
        channel_id: 'channel-id',
        channel_name: 'channel-name',
        slug: 'ALL', // null -> 'ALL'
        role_id: 'role-id',
        role_name: 'Test Role',
        attribute_key: '', // null -> ''
        attribute_value: '', // null -> ''
        min_items: 1 // null -> 1
      });
    });

    it('should preserve provided values', async () => {
      await service.addRoleMapping(
        'server-id',
        'server-name',
        'channel-id',
        'channel-name',
        'specific-collection',
        'role-id',
        'Specific Role',
        'trait_type',
        'rare',
        5
      );

      // Verify insert was called with provided values
      expect(mockSupabase.from().insert).toHaveBeenCalledWith({
        server_id: 'server-id',
        server_name: 'server-name',
        channel_id: 'channel-id',
        channel_name: 'channel-name',
        slug: 'specific-collection',
        role_id: 'role-id',
        role_name: 'Specific Role',
        attribute_key: 'trait_type',
        attribute_value: 'rare',
        min_items: 5
      });
    });

    it('should handle empty strings as falsy', async () => {
      await service.addRoleMapping(
        'server-id',
        'server-name',
        'channel-id',
        'channel-name',
        '', // empty string slug
        'role-id',
        'Empty Role', // role_name
        '', // empty string attrKey  
        '', // empty string attrVal
        0   // zero minItems
      );

      // Verify empty string slug becomes 'ALL', others stay as provided
      expect(mockSupabase.from().insert).toHaveBeenCalledWith({
        server_id: 'server-id',
        server_name: 'server-name',
        channel_id: 'channel-id',
        channel_name: 'channel-name',
        slug: 'ALL', // empty string -> 'ALL'
        role_id: 'role-id',
        role_name: 'Empty Role',
        attribute_key: '', // empty string preserved
        attribute_value: '', // empty string preserved
        min_items: 0 // zero preserved (explicit 0 overrides default)
      });
    });
  });
});
