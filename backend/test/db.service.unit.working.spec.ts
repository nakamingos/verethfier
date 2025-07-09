/**
 * DbService Unit Tests - Working Version
 * 
 * This version uses a different approach to properly mock the global supabase client.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

// Create a comprehensive mock for the Supabase client
const createMockSupabaseClient = () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
});

const mockSupabaseClient = createMockSupabaseClient();

// Mock the createClient function
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock environment config
jest.mock('../src/config/environment.config', () => ({
  EnvironmentConfig: {
    validate: jest.fn(),
    DB_SUPABASE_URL: 'mock-url',
    DB_SUPABASE_KEY: 'mock-key',
  },
}));

// Import AFTER mocking to ensure the module uses our mocked dependencies
import { DbService } from '../src/services/db.service';

describe('DbService (Working Unit Tests)', () => {
  let service: DbService;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Reset all mocks
    Object.values(mockSupabaseClient).forEach(fn => {
      if (jest.isMockFunction(fn)) {
        fn.mockClear();
      }
    });

    // Reset return values to chainable
    Object.keys(mockSupabaseClient).forEach(key => {
      if (key !== 'single' && key !== 'limit' && key !== 'eq' && key !== 'select' && key !== 'upsert' && key !== 'insert') {
        (mockSupabaseClient as any)[key].mockReturnThis();
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
    loggerSpy = jest.spyOn(Logger, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerSpy.mockRestore();
  });

  describe('addUpdateServer', () => {
    it('should successfully add or update a server', async () => {
      const mockData = { id: 'server123', name: 'Test Server', role_id: 'role123' };
      mockSupabaseClient.upsert.mockResolvedValue({ data: mockData, error: null });

      const result = await service.addUpdateServer('server123', 'Test Server', 'role123');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('verifier_servers');
      expect(mockSupabaseClient.upsert).toHaveBeenCalledWith({
        id: 'server123',
        name: 'Test Server',
        role_id: 'role123',
      });
      expect(result).toEqual(mockData);
    });
  });

  describe('getUserServers', () => {
    it('should return user data for valid user ID', async () => {
      const mockData = [{ user_id: 'user123', servers: { server1: 'address1' } }];
      mockSupabaseClient.eq.mockResolvedValue({ data: mockData, error: null });

      const result = await service.getUserServers('user123');

      expect(result).toEqual(mockData[0]);
    });
  });

  describe('getServerRole', () => {
    it('should return role ID for existing server', async () => {
      const mockData = [{ role_id: 'role123' }];
      mockSupabaseClient.eq.mockResolvedValue({ data: mockData, error: null });

      const result = await service.getServerRole('server123');

      expect(result).toBe('role123');
    });
  });

  describe('countActiveAssignments', () => {
    it('should count active assignments', async () => {
      mockSupabaseClient.eq.mockResolvedValue({ count: 42, error: null });

      const result = await service.countActiveAssignments();

      expect(result).toBe(42);
    });
  });
});
