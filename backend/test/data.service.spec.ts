import { Test, TestingModule } from '@nestjs/testing';

// Mock dotenv to prevent real config loading
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Set up environment variables to prevent the service from throwing
process.env.DATA_SUPABASE_URL = 'http://localhost:3000';
process.env.DATA_SUPABASE_ANON_KEY = 'test-key';

// Create a mock that has all query methods and can be awaited as a promise
const createMockQuery = () => {
  // Queue of results for sequential calls
  let resultQueue = [{ data: [], error: null }];
  let currentIndex = 0;
  
  const mockQuery = {
    select: jest.fn(),
    or: jest.fn(),
    eq: jest.fn(),
    in: jest.fn(),
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
  mockQuery.or.mockReturnValue(mockQuery);
  mockQuery.eq.mockReturnValue(mockQuery);
  mockQuery.in.mockReturnValue(mockQuery);
  
  return mockQuery;
};

let mockSupabaseQuery = createMockQuery();

const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseQuery)
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

import { DataService } from '../src/services/data.service';

describe('DataService', () => {
  let service: DataService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create a fresh mock query for each test
    mockSupabaseQuery = createMockQuery();
    mockSupabaseClient.from.mockReturnValue(mockSupabaseQuery);
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataService],
    }).compile();

    service = module.get<DataService>(DataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkAssetOwnership', () => {
    it('should return a number', async () => {
      const result = await service.checkAssetOwnership('0x123');
      expect(typeof result).toBe('number');
    });

    it('should handle empty data', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      const result = await service.checkAssetOwnership('0x123');
      expect(result).toBe(0);
    });

    it('should handle non-empty data', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ hashId: '1' }, { hashId: '2' }], 
        error: null 
      });
      const result = await service.checkAssetOwnership('0x123');
      expect(result).toBe(2);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Database error' } 
      });
      await expect(service.checkAssetOwnership('0x123')).rejects.toThrow('Database error');
    });
  });

  describe('getOwnedSlugs', () => {
    it('should return an array', async () => {
      const result = await service.getOwnedSlugs('0x123');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return unique slugs', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          { slug: 'collection1' },
          { slug: 'collection2' },
          { slug: 'collection1' } // duplicate
        ], 
        error: null 
      });
      const result = await service.getOwnedSlugs('0x123');
      expect(result).toEqual(['collection1', 'collection2']);
    });

    it('should handle null data', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      const result = await service.getOwnedSlugs('0x123');
      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Query failed' } 
      });
      await expect(service.getOwnedSlugs('0x123')).rejects.toThrow('Query failed');
    });
  });

  describe('getDetailedAssets', () => {
    it('should return an array', async () => {
      const result = await service.getDetailedAssets('0x123');
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array when no ethscriptions', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      const result = await service.getDetailedAssets('0x123');
      expect(result).toEqual([]);
    });

    it('should combine ethscriptions with attributes', async () => {
      // Set up results for two sequential calls
      mockSupabaseQuery.setResults([
        // First call for ethscriptions
        { 
          data: [{ hashId: '1', slug: 'test', sha: 'sha1' }], 
          error: null 
        },
        // Second call for attributes  
        { 
          data: [{ sha: 'sha1', values: { rarity: 'rare' } }], 
          error: null 
        }
      ]);
      
      const result = await service.getDetailedAssets('0x123');
      expect(result).toEqual([{ slug: 'test', attributes: { rarity: 'rare' } }]);
    });

    it('should handle ethscriptions query errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Ethscriptions error' } 
      });
      await expect(service.getDetailedAssets('0x123'))
        .rejects.toThrow('Failed to fetch ethscriptions: Ethscriptions error');
    });

    it('should handle attributes query errors', async () => {
      // Set up results for two sequential calls
      mockSupabaseQuery.setResults([
        // First call succeeds
        { 
          data: [{ hashId: '1', slug: 'test', sha: 'sha1' }], 
          error: null 
        },
        // Second call fails
        { 
          data: null, 
          error: { message: 'Attributes error' } 
        }
      ]);
      await expect(service.getDetailedAssets('0x123'))
        .rejects.toThrow('Failed to fetch attributes: Attributes error');
    });
  });

  describe('getAllSlugs', () => {
    it('should return array with all-collections prefix', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ slug: 'collection1' }], 
        error: null 
      });
      const result = await service.getAllSlugs();
      expect(result).toEqual(['all-collections', 'collection1']);
    });

    it('should handle empty collections', async () => {
      mockSupabaseQuery.setResult({ data: [], error: null });
      const result = await service.getAllSlugs();
      expect(result).toEqual(['all-collections']);
    });

    it('should handle database errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Collections error' } 
      });
      await expect(service.getAllSlugs()).rejects.toThrow('Collections error');
    });
  });

  describe('checkAssetOwnershipWithCriteria', () => {
    it('should handle basic queries without attributes', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ hashId: '1' }], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'ALL', 'ALL', 1);
      expect(result).toBe(1);
    });

    it('should return 0 when minimum not met', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ hashId: '1' }], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'ALL', 'ALL', 3);
      expect(result).toBe(0);
    });

    it('should handle attribute filtering queries', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          {
            hashId: '1',
            attributes_new: { values: { rarity: 'rare' } }
          }
        ], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', 'rare', 1);
      expect(result).toBe(1);
    });

    it('should handle join query errors', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Join error' } 
      });
      await expect(service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', 'rare', 1))
        .rejects.toThrow('Failed to query with join: Join error');
    });
  });

  describe('checkAssetOwnershipWithCriteria - additional coverage', () => {
    it('should handle slug filtering for specific collections', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ hashId: '1' }], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'specific-collection', 'ALL', 'ALL', 1);
      expect(result).toBe(1);
    });

    it('should return 0 when no items found with join query', async () => {
      mockSupabaseQuery.setResult({ 
        data: [], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', 'rare', 1);
      expect(result).toBe(0);
    });

    it('should handle attribute key "ALL" searching across all keys', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          {
            hashId: '1',
            attributes_new: { values: { rarity: 'rare', type: 'legendary' } }
          }
        ], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'ALL', 'rare', 1);
      expect(result).toBe(1);
    });

    it('should handle case-insensitive attribute key matching', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          {
            hashId: '1',
            attributes_new: { values: { Rarity: 'rare' } }
          }
        ], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', 'rare', 1);
      expect(result).toBe(1);
    });

    it('should handle attribute key without specific value (ANY value)', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          {
            hashId: '1',
            attributes_new: { values: { rarity: 'common' } }
          }
        ], 
        error: null 
      });
      // Using empty string for attributeValue should match any value for the key
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', '', 1);
      expect(result).toBe(1);
    });

    it('should handle missing attributes_new in response data', async () => {
      mockSupabaseQuery.setResult({ 
        data: [
          {
            hashId: '1',
            // Missing attributes_new
          }
        ], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'rarity', 'rare', 1);
      expect(result).toBe(0);
    });
  });

  describe('getAllSlugs - additional coverage', () => {
    it('should handle null/undefined data gracefully', async () => {
      mockSupabaseQuery.setResult({ data: null, error: null });
      const result = await service.getAllSlugs();
      expect(result).toEqual(['all-collections']);
    });
  });

  describe('getDetailedAssets - additional coverage', () => {
    it('should handle missing sha values in ethscriptions', async () => {
      mockSupabaseQuery.setResults([
        // First call - ethscriptions with some missing sha values
        { 
          data: [
            { hashId: '1', slug: 'test1', sha: 'sha1' },
            { hashId: '2', slug: 'test2', sha: null },
            { hashId: '3', slug: 'test3', sha: undefined }
          ], 
          error: null 
        },
        // Second call - attributes (only for sha1)
        { 
          data: [{ sha: 'sha1', values: { rarity: 'rare' } }], 
          error: null 
        }
      ]);
      
      const result = await service.getDetailedAssets('0x123');
      expect(result).toEqual([
        { slug: 'test1', attributes: { rarity: 'rare' } },
        { slug: 'test2', attributes: {} },
        { slug: 'test3', attributes: {} }
      ]);
    });

    it('should handle missing or null attributes data', async () => {
      mockSupabaseQuery.setResults([
        { 
          data: [{ hashId: '1', slug: 'test', sha: 'sha1' }], 
          error: null 
        },
        { 
          data: null, // No attributes found
          error: null 
        }
      ]);
      
      const result = await service.getDetailedAssets('0x123');
      expect(result).toEqual([{ slug: 'test', attributes: {} }]);
    });
  });

  describe('error handling coverage', () => {
    it('should handle basic query errors in checkAssetOwnershipWithCriteria', async () => {
      mockSupabaseQuery.setResult({ 
        data: null, 
        error: { message: 'Basic query error' } 
      });
      await expect(service.checkAssetOwnershipWithCriteria('0x123', 'ALL', 'ALL', 'ALL', 1))
        .rejects.toThrow('Basic query error');
    });

    it('should handle slug filtering in attribute queries', async () => {
      mockSupabaseQuery.setResult({ 
        data: [{ hashId: '1', attributes_new: { values: { rarity: 'rare' } } }], 
        error: null 
      });
      const result = await service.checkAssetOwnershipWithCriteria('0x123', 'specific-collection', 'rarity', 'rare', 1);
      expect(result).toBe(1);
    });
  });
});
