import { Test, TestingModule } from '@nestjs/testing';
import { NonceService } from '../src/services/nonce.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

const cacheStore = new Map<string, any>();

const mockCache = {
  set: jest.fn(async (key: string, value: any) => {
    cacheStore.set(key, value);
  }),
  get: jest.fn(async (key: string) => cacheStore.get(key)),
  del: jest.fn(async (key: string) => {
    cacheStore.delete(key);
  }),
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
    cacheStore.clear();
  });

  it('creates a nonce and stores it in cache', async () => {
    const nonce = await service.createNonce('user1', 'guild1');

    expect(typeof nonce).toBe('string');
    expect(mockCache.set).toHaveBeenCalledWith(
      `nonce_${nonce}`,
      expect.objectContaining({
        userId: 'user1',
        guildId: 'guild1',
        nonce,
      }),
      expect.any(Number)
    );
    expect(mockCache.set).toHaveBeenCalledWith(
      'latest_nonce_user1_guild1_global',
      nonce,
      expect.any(Number)
    );
  });

  it('validates a correct nonce', async () => {
    await mockCache.set('nonce_abc123', {
      userId: 'user1',
      guildId: 'guild1',
      nonce: 'abc123',
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await mockCache.set('latest_nonce_user1_guild1_ch1', 'abc123');

    const result = await service.validateNonce('user1', 'guild1', 'abc123');

    expect(result).toBe(true);
  });

  it('rejects a nonce created for another user', async () => {
    await mockCache.set('nonce_abc123', {
      userId: 'user2',
      guildId: 'guild1',
      nonce: 'abc123',
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await mockCache.set('latest_nonce_user2_guild1_ch1', 'abc123');

    const result = await service.validateNonce('user1', 'guild1', 'abc123');

    expect(result).toBe(false);
  });

  it('rejects a nonce created for another guild', async () => {
    await mockCache.set('nonce_abc123', {
      userId: 'user1',
      guildId: 'guild2',
      nonce: 'abc123',
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await mockCache.set('latest_nonce_user1_guild2_ch1', 'abc123');

    const result = await service.validateNonce('user1', 'guild1', 'abc123');

    expect(result).toBe(false);
  });

  it('returns nonce data only for the matching user and nonce', async () => {
    await mockCache.set('nonce_abc123', {
      userId: 'user1',
      guildId: 'guild1',
      nonce: 'abc123',
      messageId: 'msg1',
      channelId: 'ch1',
    });

    await expect(service.getNonceData('user1', 'abc123')).resolves.toEqual({
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await expect(service.getNonceData('user2', 'abc123')).resolves.toEqual({});
  });

  it('supports multiple active nonces for the same user across different channels', async () => {
    const firstNonce = await service.createNonce('user1', 'guild1', 'msg1', 'ch1');
    const secondNonce = await service.createNonce('user1', 'guild1', 'msg2', 'ch2');

    expect(firstNonce).not.toBe(secondNonce);
    await expect(service.validateNonce('user1', 'guild1', firstNonce)).resolves.toBe(true);
    await expect(service.validateNonce('user1', 'guild1', secondNonce)).resolves.toBe(true);
    await expect(service.getNonceData('user1', firstNonce)).resolves.toEqual({
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await expect(service.getNonceData('user1', secondNonce)).resolves.toEqual({
      messageId: 'msg2',
      channelId: 'ch2',
    });
  });

  it('invalidates the older nonce when a newer link is created in the same channel', async () => {
    const firstNonce = await service.createNonce('user1', 'guild1', 'msg1', 'ch1');
    const secondNonce = await service.createNonce('user1', 'guild1', 'msg2', 'ch1');

    await expect(service.validateNonce('user1', 'guild1', firstNonce)).resolves.toBe(false);
    await expect(service.validateNonce('user1', 'guild1', secondNonce)).resolves.toBe(true);
  });

  it('invalidates a nonce by nonce value', async () => {
    await mockCache.set('nonce_abc123', {
      userId: 'user1',
      guildId: 'guild1',
      nonce: 'abc123',
      messageId: 'msg1',
      channelId: 'ch1',
    });
    await mockCache.set('latest_nonce_user1_guild1_ch1', 'abc123');

    await service.invalidateNonce('abc123');

    expect(mockCache.del).toHaveBeenCalledWith('nonce_abc123');
    expect(mockCache.del).toHaveBeenCalledWith('latest_nonce_user1_guild1_ch1');
    await expect(service.validateNonce('user1', 'guild1', 'abc123')).resolves.toBe(false);
  });
});
