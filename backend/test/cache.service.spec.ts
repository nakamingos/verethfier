import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { CacheService } from '../src/services/cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let mockCacheManager: any;

  beforeEach(async () => {
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('basic cache operations', () => {
    it('should set and get values', async () => {
      const key = 'test-key';
      const value = { test: 'data' };
      
      mockCacheManager.get.mockResolvedValue(value);
      
      await service.set(key, value, 60);
      const retrieved = await service.get(key);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, value, 60);
      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      mockCacheManager.get.mockResolvedValue(undefined);
      
      const result = await service.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete cached values', async () => {
      const key = 'delete-test';
      
      await service.del(key);
      
      expect(mockCacheManager.del).toHaveBeenCalledWith(key);
    });

    it('should handle cache errors gracefully', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Cache error'));
      
      const result = await service.get('error-key');
      expect(result).toBeNull();
    });
  });

  describe('specialized cache methods', () => {
    it('should cache server rules', async () => {
      const serverId = 'test-server';
      const rules = [{ id: 1, slug: 'test-collection' }];
      
      await service.cacheServerRules(serverId, rules);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `rules:server:${serverId}`,
        rules,
        expect.any(Number)
      );
    });

    it('should get cached server rules', async () => {
      const serverId = 'test-server';
      const rules = [{ id: 1, slug: 'test-collection' }];
      
      mockCacheManager.get.mockResolvedValue(rules);
      
      const cached = await service.getCachedServerRules(serverId);
      
      expect(mockCacheManager.get).toHaveBeenCalledWith(`rules:server:${serverId}`);
      expect(cached).toEqual(rules);
    });

    it('should cache user assets', async () => {
      const address = '0x123';
      const assets = [{ collection: 'test', tokens: ['1', '2'] }];
      
      await service.cacheUserAssets(address, assets);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'assets:0x123',
        assets,
        expect.any(Number)
      );
    });

    it('should get cached user assets', async () => {
      const address = '0x123';
      const assets = [{ collection: 'test', tokens: ['1', '2'] }];
      
      mockCacheManager.get.mockResolvedValue(assets);
      
      const cached = await service.getCachedUserAssets(address);
      
      expect(cached).toEqual(assets);
    });

    it('should cache slugs', async () => {
      const slugs = ['collection1', 'collection2'];
      
      await service.cacheSlugs(slugs);
      
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'slugs:all',
        slugs,
        expect.any(Number)
      );
    });

    it('should get cached slugs', async () => {
      const slugs = ['collection1', 'collection2'];
      
      mockCacheManager.get.mockResolvedValue(slugs);
      
      const cached = await service.getCachedSlugs();
      
      expect(cached).toEqual(slugs);
    });
  });

  describe('getOrSet functionality', () => {
    it('should return cached value if available', async () => {
      const key = 'test-key';
      const cachedValue = 'cached-data';
      
      mockCacheManager.get.mockResolvedValue(cachedValue);
      
      const fallbackFn = jest.fn();
      const result = await service.getOrSet(key, fallbackFn, 60);
      
      expect(result).toBe(cachedValue);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it('should execute fallback and cache result when no cached value', async () => {
      const key = 'test-key';
      const fallbackValue = 'fallback-data';
      
      mockCacheManager.get.mockResolvedValue(undefined);
      const fallbackFn = jest.fn().mockResolvedValue(fallbackValue);
      
      const result = await service.getOrSet(key, fallbackFn, 60);
      
      expect(result).toBe(fallbackValue);
      expect(fallbackFn).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith(key, fallbackValue, 60);
    });
  });

  describe('TTL configuration', () => {
    it('should provide TTL values', () => {
      const ttl = CacheService.getTTL();
      
      expect(ttl).toBeDefined();
      expect(typeof ttl.RULES).toBe('number');
      expect(typeof ttl.USER_ASSETS).toBe('number');
      expect(typeof ttl.SLUGS).toBe('number');
      expect(typeof ttl.GUILD_ROLES).toBe('number');
      expect(typeof ttl.NONCES).toBe('number');
    });
  });
});
