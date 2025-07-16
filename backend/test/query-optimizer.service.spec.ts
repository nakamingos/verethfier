import { Test, TestingModule } from '@nestjs/testing';
import { QueryOptimizer } from '../src/services/query-optimizer.service';
import { AppLogger } from '../src/utils/app-logger.util';

/**
 * QueryOptimizer Test Suite
 * 
 * Comprehensive tests for the database query optimization service, covering:
 * - Performance monitoring and timing
 * - Slow query detection and logging
 * - Batch operation utilities
 * - Query parameter validation and sanitization
 * - Error handling and resilience
 * - Memory and performance optimization
 */
describe('QueryOptimizer', () => {
  let service: QueryOptimizer;

  // Mock AppLogger to capture logging calls
  const mockAppLogger = {
    logDbOperation: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueryOptimizer],
    }).compile();

    service = module.get<QueryOptimizer>(QueryOptimizer);

    // Mock AppLogger methods
    jest.spyOn(AppLogger, 'logDbOperation').mockImplementation(mockAppLogger.logDbOperation);
    jest.spyOn(AppLogger, 'warn').mockImplementation(mockAppLogger.warn);
    jest.spyOn(AppLogger, 'error').mockImplementation(mockAppLogger.error);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeWithTiming', () => {
    it('should execute query successfully and log performance', async () => {
      const mockQuery = jest.fn().mockResolvedValue('test-result');
      
      const result = await service.executeWithTiming(
        mockQuery,
        'SELECT',
        'test_table'
      );

      expect(result).toBe('test-result');
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockAppLogger.logDbOperation).toHaveBeenCalledWith(
        'SELECT',
        'test_table',
        expect.any(Number)
      );
    });

    it('should detect and log slow queries', async () => {
      const slowQuery = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow-result'), 1100))
      );

      const result = await service.executeWithTiming(
        slowQuery,
        'COMPLEX_SELECT',
        'large_table'
      );

      expect(result).toBe('slow-result');
      expect(mockAppLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow query detected: COMPLEX_SELECT on large_table took')
      );
    });

    it('should handle query errors gracefully', async () => {
      const errorQuery = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(service.executeWithTiming(
        errorQuery,
        'INSERT',
        'user_table'
      )).rejects.toThrow('Database connection failed');

      expect(mockAppLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Query failed: INSERT on user_table after'),
        'Database connection failed'
      );
    });

    it('should measure performance accurately', async () => {
      const startTime = Date.now();
      const fixedDurationQuery = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('timed-result'), 100))
      );

      await service.executeWithTiming(
        fixedDurationQuery,
        'TIMED_QUERY',
        'perf_table'
      );

      const [operation, table, duration] = mockAppLogger.logDbOperation.mock.calls[0];
      expect(operation).toBe('TIMED_QUERY');
      expect(table).toBe('perf_table');
      expect(duration).toBeGreaterThanOrEqual(90); // Allow some timing variance
      expect(duration).toBeLessThan(200);
    });

    it('should handle queries that return null/undefined', async () => {
      const nullQuery = jest.fn().mockResolvedValue(null);
      const undefinedQuery = jest.fn().mockResolvedValue(undefined);

      const nullResult = await service.executeWithTiming(nullQuery, 'NULL_SELECT', 'test_table');
      const undefinedResult = await service.executeWithTiming(undefinedQuery, 'UNDEFINED_SELECT', 'test_table');

      expect(nullResult).toBeNull();
      expect(undefinedResult).toBeUndefined();
      expect(mockAppLogger.logDbOperation).toHaveBeenCalledTimes(2);
    });

    it('should handle complex data types', async () => {
      const complexData = {
        users: [{ id: 1, name: 'test' }, { id: 2, name: 'test2' }],
        metadata: { total: 2, page: 1 },
        nested: { deep: { value: 'found' } }
      };
      const complexQuery = jest.fn().mockResolvedValue(complexData);

      const result = await service.executeWithTiming(
        complexQuery,
        'COMPLEX_SELECT',
        'normalized_view'
      );

      expect(result).toEqual(complexData);
      expect(mockAppLogger.logDbOperation).toHaveBeenCalledWith(
        'COMPLEX_SELECT',
        'normalized_view',
        expect.any(Number)
      );
    });
  });

  describe('executeBatch', () => {
    it('should execute all operations in batches', async () => {
      const operations = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
        jest.fn().mockResolvedValue('result3'),
        jest.fn().mockResolvedValue('result4'),
        jest.fn().mockResolvedValue('result5'),
      ];

      const results = await service.executeBatch(operations, 2, 10);

      expect(results).toEqual(['result1', 'result2', 'result3', 'result4', 'result5']);
      operations.forEach(op => expect(op).toHaveBeenCalledTimes(1));
    });

    it('should respect batch size limits', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => 
        jest.fn().mockResolvedValue(`result${i}`)
      );

      const batchSpy = jest.spyOn(Promise, 'all');
      
      await service.executeBatch(operations, 3, 0); // No delay for faster test

      // Should create 4 batches: [3, 3, 3, 1]
      expect(batchSpy).toHaveBeenCalledTimes(4);
      
      batchSpy.mockRestore();
    });

    it('should handle batch delays correctly', async () => {
      const operations = [
        jest.fn().mockResolvedValue('batch1-1'),
        jest.fn().mockResolvedValue('batch1-2'),
        jest.fn().mockResolvedValue('batch2-1'),
        jest.fn().mockResolvedValue('batch2-2'),
      ];

      const startTime = Date.now();
      await service.executeBatch(operations, 2, 50);
      const duration = Date.now() - startTime;

      // Should have at least one delay of 50ms between batches
      expect(duration).toBeGreaterThanOrEqual(45); // Allow some timing variance
    });

    it('should handle batch errors gracefully', async () => {
      const operations = [
        jest.fn().mockResolvedValue('success1'),
        jest.fn().mockRejectedValue(new Error('batch error')),
        jest.fn().mockResolvedValue('success2'),
      ];

      await expect(service.executeBatch(operations, 2, 0))
        .rejects.toThrow('batch error');
    });

    it('should work with empty operations array', async () => {
      const results = await service.executeBatch([], 5, 10);
      
      expect(results).toEqual([]);
    });

    it('should handle large batches efficiently', async () => {
      const largeOperationSet = Array.from({ length: 100 }, (_, i) => 
        jest.fn().mockResolvedValue(`large-result-${i}`)
      );

      const startTime = Date.now();
      const results = await service.executeBatch(largeOperationSet, 10, 5);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(100);
      expect(results[0]).toBe('large-result-0');
      expect(results[99]).toBe('large-result-99');
      
      // Should complete reasonably quickly with small delays
      expect(duration).toBeLessThan(500); // Allow for 10 batches * 5ms = 50ms + execution
    });

    it('should preserve result order', async () => {
      const operations = [
        jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('slow'), 20))),
        jest.fn().mockResolvedValue('fast'),
        jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('medium'), 10))),
      ];

      const results = await service.executeBatch(operations, 5, 0);

      // Order should be preserved despite different execution times
      expect(results).toEqual(['slow', 'fast', 'medium']);
    });
  });

  describe('buildOptimizedQuery', () => {
    it('should apply default optimization settings', () => {
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      const optimizedQuery = service.buildOptimizedQuery(mockQuery);

      expect(mockQuery.limit).toHaveBeenCalledWith(9940);
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(optimizedQuery).toBe(mockQuery); // Should return the same query object
    });

    it('should chain methods correctly', () => {
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const result = service.buildOptimizedQuery(mockQuery);

      // Verify method chaining works
      expect(result).toBe(mockQuery);
      expect(mockQuery.limit).toHaveBeenCalled();
      expect(mockQuery.order).toHaveBeenCalled();
    });

    it('should handle queries without chainable methods', () => {
      const simpleQuery = {
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };

      // Should not throw even if methods don't return this
      expect(() => service.buildOptimizedQuery(simpleQuery)).not.toThrow();
    });
  });

  describe('validateQueryParams', () => {
    it('should validate and sanitize string parameters', () => {
      const params = {
        name: '  John Doe  ',
        email: 'test@example.com',
        longString: 'a'.repeat(600), // Exceeds 500 char limit
      };

      const validated = service.validateQueryParams(params);

      expect(validated.name).toBe('John Doe'); // Trimmed
      expect(validated.email).toBe('test@example.com');
      expect(validated.longString).toHaveLength(500); // Truncated
    });

    it('should validate numeric parameters', () => {
      const params = {
        id: 123,
        price: 99.99,
        invalid: NaN,
        infinity: Infinity,
      };

      const validated = service.validateQueryParams(params);

      expect(validated.id).toBe(123);
      expect(validated.price).toBe(99.99);
      expect(validated.invalid).toBeUndefined(); // NaN removed
      expect(validated.infinity).toBe(Infinity); // Infinity is valid
    });

    it('should validate boolean parameters', () => {
      const params = {
        isActive: true,
        isDeleted: false,
      };

      const validated = service.validateQueryParams(params);

      expect(validated.isActive).toBe(true);
      expect(validated.isDeleted).toBe(false);
    });

    it('should remove null and undefined values', () => {
      const params = {
        name: 'valid',
        nullValue: null,
        undefinedValue: undefined,
      };

      const validated = service.validateQueryParams(params);

      expect(validated.name).toBe('valid');
      expect(validated.nullValue).toBeUndefined();
      expect(validated.undefinedValue).toBeUndefined();
    });

    it('should remove invalid data types', () => {
      const params = {
        validString: 'keep',
        validNumber: 42,
        validBoolean: true,
        arrayValue: [1, 2, 3],
        objectValue: { nested: 'object' },
        functionValue: () => 'test',
        symbolValue: Symbol('test'),
      };

      const validated = service.validateQueryParams(params);

      expect(validated.validString).toBe('keep');
      expect(validated.validNumber).toBe(42);
      expect(validated.validBoolean).toBe(true);
      expect(validated.arrayValue).toBeUndefined();
      expect(validated.objectValue).toBeUndefined();
      expect(validated.functionValue).toBeUndefined();
      expect(validated.symbolValue).toBeUndefined();
    });

    it('should handle empty objects', () => {
      const validated = service.validateQueryParams({});
      
      expect(validated).toEqual({});
    });

    it('should handle SQL injection patterns', () => {
      const params = {
        maliciousString: "'; DROP TABLE users; --",
        normalString: 'safe value',
        numericString: '123',
      };

      const validated = service.validateQueryParams(params);

      // String should be preserved but length-limited
      expect(validated.maliciousString).toBe("'; DROP TABLE users; --");
      expect(validated.normalString).toBe('safe value');
      expect(validated.numericString).toBe('123');
    });

    it('should handle edge cases and special characters', () => {
      const params = {
        emptyString: '',
        whitespaceOnly: '   ',
        unicodeString: '🚀 Unicode test 测试',
        specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
      };

      const validated = service.validateQueryParams(params);

      expect(validated.emptyString).toBe('');
      expect(validated.whitespaceOnly).toBe(''); // Trimmed to empty
      expect(validated.unicodeString).toBe('🚀 Unicode test 测试');
      expect(validated.specialChars).toBe('!@#$%^&*()_+-=[]{}|;:,.<>?');
    });
  });

  describe('performance and memory optimization', () => {
    it('should handle large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        data: 'x'.repeat(100),
      }));

      const largeDataQuery = jest.fn().mockResolvedValue(largeDataset);

      const startTime = Date.now();
      const result = await service.executeWithTiming(
        largeDataQuery,
        'LARGE_SELECT',
        'big_table'
      );
      const duration = Date.now() - startTime;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(100); // Should be very fast for mock
      expect(mockAppLogger.logDbOperation).toHaveBeenCalledWith(
        'LARGE_SELECT',
        'big_table',
        expect.any(Number)
      );
    });

    it('should optimize memory usage with batch processing', async () => {
      const memoryIntensiveOperations = Array.from({ length: 50 }, (_, i) => 
        jest.fn().mockResolvedValue(`memory-test-${i}`)
      );

      // Use small batch size to test memory efficiency
      const results = await service.executeBatch(memoryIntensiveOperations, 5, 1);

      expect(results).toHaveLength(50);
      // All operations should be executed
      memoryIntensiveOperations.forEach(op => expect(op).toHaveBeenCalledTimes(1));
    });

    it('should handle concurrent query timing accurately', async () => {
      const concurrentQueries = [
        () => new Promise(resolve => setTimeout(() => resolve('query1'), 50)),
        () => new Promise(resolve => setTimeout(() => resolve('query2'), 100)),
        () => new Promise(resolve => setTimeout(() => resolve('query3'), 25)),
      ];

      const promises = concurrentQueries.map((query, index) =>
        service.executeWithTiming(query, `CONCURRENT_${index}`, `table_${index}`)
      );

      const results = await Promise.all(promises);

      expect(results).toEqual(['query1', 'query2', 'query3']);
      expect(mockAppLogger.logDbOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('error resilience and edge cases', () => {
    it('should handle timeout scenarios', async () => {
      const timeoutQuery = jest.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 100)
        )
      );

      await expect(service.executeWithTiming(
        timeoutQuery,
        'TIMEOUT_QUERY',
        'slow_table'
      )).rejects.toThrow('Query timeout');

      expect(mockAppLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Query failed: TIMEOUT_QUERY on slow_table after'),
        'Query timeout'
      );
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error: Connection lost');
      const networkQuery = jest.fn().mockRejectedValue(networkError);

      await expect(service.executeWithTiming(
        networkQuery,
        'NETWORK_QUERY',
        'remote_table'
      )).rejects.toThrow('Network error: Connection lost');
    });

    it('should validate extreme parameter values', () => {
      const extremeParams = {
        veryLongString: 'x'.repeat(100000),
        veryLargeNumber: Number.MAX_SAFE_INTEGER,
        verySmallNumber: Number.MIN_SAFE_INTEGER,
        negativeZero: -0,
        positiveZero: +0,
      };

      const validated = service.validateQueryParams(extremeParams);

      expect(validated.veryLongString).toHaveLength(500); // Truncated
      expect(validated.veryLargeNumber).toBe(Number.MAX_SAFE_INTEGER);
      expect(validated.verySmallNumber).toBe(Number.MIN_SAFE_INTEGER);
      expect(validated.negativeZero).toBe(-0);
      expect(validated.positiveZero).toBe(+0);
    });

    it('should handle malformed query objects', () => {
      const malformedQuery = null;

      expect(() => service.buildOptimizedQuery(malformedQuery))
        .toThrow(); // Should throw when trying to call methods on null
    });
  });
});
