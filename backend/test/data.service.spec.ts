import { Test, TestingModule } from '@nestjs/testing';
import { DataService } from '../src/services/data.service';

var mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('DataService', () => {
  let service: DataService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataService],
    }).compile();
    service = module.get<DataService>(DataService);
    jest.clearAllMocks();
  });

  it('checkAssetOwnership returns asset count', async () => {
    mockSupabase.or.mockReturnValueOnce({ data: [1, 2], error: null });
    const count = await service.checkAssetOwnership('0xabc');
    expect(count).toBe(2);
  });

  it('getOwnedSlugs returns unique slugs', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ slug: 'a' }, { slug: 'a' }, { slug: 'b' }], error: null });
    const slugs = await service.getOwnedSlugs('0xabc');
    expect(slugs).toEqual(['a', 'b']);
  });

  it('getDetailedAssets returns mapped assets', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ slug: 'foo', values: { x: 1 } }], error: null });
    const assets = await service.getDetailedAssets('0xabc');
    expect(assets).toEqual([{ slug: 'foo', attributes: { x: 1 } }]);
  });

  it('getAllSlugs returns all slugs', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ slug: 'foo' }, { slug: 'bar' }], error: null });
    const slugs = await service.getAllSlugs();
    expect(slugs).toEqual(['foo', 'bar']);
  });
});
