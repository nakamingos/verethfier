import { Test, TestingModule } from '@nestjs/testing';
import { DataService } from '../src/services/data.service';

function deepChainableMock(returnValue: any) {
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    or: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    update: jest.fn(() => chain),
    from: jest.fn(() => chain),
    then: jest.fn((cb) => Promise.resolve(cb(returnValue))),
    async [Symbol.asyncIterator]() { return returnValue; },
  };
  Object.assign(chain, returnValue);
  return jest.fn(() => chain);
}

var mockSupabase: any;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('DataService', () => {
  let service: DataService;

  beforeEach(() => {
    mockSupabase = {
      from: deepChainableMock({ data: [{ slug: 'a' }, { slug: 'a' }, { slug: 'b' }], error: null }),
    };
    service = new DataService(mockSupabase);
    jest.clearAllMocks();
  });

  it('checkAssetOwnership returns asset count', async () => {
    mockSupabase.from = deepChainableMock({ data: [1, 2], error: null });
    const count = await service.checkAssetOwnership('0xabc');
    expect(count).toBe(2);
  });

  it('getOwnedSlugs returns unique slugs', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ slug: 'a' }, { slug: 'a' }, { slug: 'b' }], error: null });
    const slugs = await service.getOwnedSlugs('0xabc');
    expect(slugs).toEqual(['a', 'b']);
  });

  it('getDetailedAssets returns mapped assets', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ slug: 'foo', values: { x: 1 } }], error: null });
    const assets = await service.getDetailedAssets('0xabc');
    expect(assets).toEqual([{ slug: 'foo', attributes: { x: 1 } }]);
  });

  it('getAllSlugs returns all slugs', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ slug: 'foo' }, { slug: 'bar' }], error: null });
    const slugs = await service.getAllSlugs();
    expect(slugs).toEqual(['foo', 'bar']);
  });
});
