import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../src/services/db.service';

var mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();
    service = module.get<DbService>(DbService);
    jest.clearAllMocks();
  });

  it('addUpdateServer upserts server', async () => {
    mockSupabase.upsert.mockReturnValueOnce({ data: [{ id: '1' }], error: null });
    const data = await service.addUpdateServer('1', 'name', 'role');
    expect(data).toEqual([{ id: '1' }]);
  });

  it('getUserServers returns user data', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ user_id: 'u', servers: {} }], error: null });
    const data = await service.getUserServers('u');
    expect(data).toEqual({ user_id: 'u', servers: {} });
  });

  it('addServerToUser updates user servers', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ servers: {} }], error: null });
    mockSupabase.update.mockReturnValueOnce({ data: [{ user_id: 'u' }], error: null });
    await service.addServerToUser('u', 's', 'r', 'a');
    expect(mockSupabase.update).toHaveBeenCalled();
  });

  it('addRoleMapping inserts mapping', async () => {
    mockSupabase.insert.mockReturnValueOnce({ data: [{ id: 1 }], error: null });
    await service.addRoleMapping('g', 'n', 'c', 's', 'r', 'k', 'v', 1);
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it('deleteRoleMapping deletes mapping', async () => {
    mockSupabase.delete.mockReturnValueOnce({ data: [{ id: 1 }], error: null });
    await service.deleteRoleMapping('1');
    expect(mockSupabase.delete).toHaveBeenCalled();
  });

  it('getRoleMappings selects mappings', async () => {
    mockSupabase.select.mockReturnValueOnce({ data: [{ id: 1 }], error: null });
    const data = await service.getRoleMappings('g', 'c');
    expect(data).toEqual([{ id: 1 }]);
  });

  it('logUserRole inserts log', async () => {
    mockSupabase.insert.mockReturnValueOnce({ data: [{ id: 1 }], error: null });
    await service.logUserRole('u', 'g', 'r', 'a');
    expect(mockSupabase.insert).toHaveBeenCalled();
  });
});
