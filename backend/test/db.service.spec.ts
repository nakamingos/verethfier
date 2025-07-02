import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../src/services/db.service';

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
    // Final call returns the value for .then()
    then: jest.fn((cb) => Promise.resolve(cb(returnValue))),
    // For await/async destructuring
    async [Symbol.asyncIterator]() { return returnValue; },
  };
  // For destructuring { data, error }
  Object.assign(chain, returnValue);
  return jest.fn(() => chain);
}

var mockSupabase: any;

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('DbService', () => {
  let service: DbService;

  beforeEach(() => {
    mockSupabase = {
      from: deepChainableMock({ data: [{ id: '1', user_id: 'u', servers: {} }], error: null }),
    };
    service = new DbService(mockSupabase);
    jest.clearAllMocks();
  });

  it('addUpdateServer upserts server', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ id: '1' }], error: null });
    const data = await service.addUpdateServer('1', 'name', 'role');
    expect(data).toEqual([{ id: '1' }]);
  });

  it('getUserServers returns user data', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ user_id: 'u', servers: {} }], error: null });
    const data = await service.getUserServers('u');
    expect(data).toEqual({ user_id: 'u', servers: {} });
  });

  it('addServerToUser updates user servers', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ servers: {} }], error: null });
    await service.addServerToUser('u', 's', 'r', 'a');
    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it('addRoleMapping inserts mapping', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ id: 1 }], error: null });
    await service.addRoleMapping('g', 'n', 'c', 's', 'r', 'k', 'v', 1);
    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it('deleteRoleMapping deletes mapping', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ id: 1 }], error: null });
    await service.deleteRoleMapping('1');
    expect(mockSupabase.from).toHaveBeenCalled();
  });

  it('getRoleMappings selects mappings', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ id: 1 }], error: null });
    const data = await service.getRoleMappings('g', 'c');
    expect(data).toEqual([{ id: 1 }]);
  });

  it('logUserRole inserts log', async () => {
    mockSupabase.from = deepChainableMock({ data: [{ id: 1 }], error: null });
    await service.logUserRole('u', 'g', 'r', 'a');
    expect(mockSupabase.from).toHaveBeenCalled();
  });
});
