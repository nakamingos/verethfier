import { Test, TestingModule } from '@nestjs/testing';
import { NonceService } from '../src/services/nonce.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

const mockCache = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

describe('NonceService', () => {
  let service: NonceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceService,
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();
    service = module.get<NonceService>(NonceService);
    jest.clearAllMocks();
  });

  it('creates a nonce and stores it in cache', async () => {
    mockCache.set.mockResolvedValue(undefined);
    const nonce = await service.createNonce('user1');
    expect(typeof nonce).toBe('string');
    expect(mockCache.set).toHaveBeenCalled();
  });

  it('validates a correct nonce', async () => {
    mockCache.get.mockResolvedValue({ nonce: 'abc123', messageId: 'msg1', channelId: 'ch1' });
    const result = await service.validateNonce('user1', 'abc123');
    expect(result).toBe(true);
  });

  it('invalidates a nonce', async () => {
    mockCache.del.mockResolvedValue(undefined);
    await service.invalidateNonce('user1');
    expect(mockCache.del).toHaveBeenCalledWith('nonce_user1');
  });
});
