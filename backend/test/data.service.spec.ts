import { Test, TestingModule } from '@nestjs/testing';

// Mock dotenv to prevent real config loading
jest.mock('dotenv', () => ({
  config: jest.fn()
}));

// Mock Supabase completely before any imports
const mockSupabaseQuery = {
  select: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis()
};

// Make all query methods return promises that resolve to empty data
Object.keys(mockSupabaseQuery).forEach(method => {
  if (method !== 'select') {
    mockSupabaseQuery[method].mockResolvedValue({ data: [], error: null });
  }
});

const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseQuery)
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Now import the service after mocking
import { DataService } from '../src/services/data.service';

describe('DataService', () => {
  let service: DataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataService],
    }).compile();

    service = module.get<DataService>(DataService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have required methods', () => {
    expect(typeof service.checkAssetOwnership).toBe('function');
    expect(typeof service.getOwnedSlugs).toBe('function');
    expect(typeof service.getDetailedAssets).toBe('function');
    expect(typeof service.getAllSlugs).toBe('function');
    expect(typeof service.checkAssetOwnershipWithCriteria).toBe('function');
  });

  it('should handle checkAssetOwnership calls', async () => {
    const result = await service.checkAssetOwnership('0x123');
    expect(typeof result).toBe('number');
  });

  it('should handle getOwnedSlugs calls', async () => {
    const result = await service.getOwnedSlugs('0x123');
    expect(Array.isArray(result)).toBe(true);
  });
});
