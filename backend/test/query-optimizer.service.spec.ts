import { Test, TestingModule } from '@nestjs/testing';
import { QueryOptimizer } from '../src/services/query-optimizer.service';

describe('QueryOptimizer', () => {
  let service: QueryOptimizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueryOptimizer],
    }).compile();

    service = module.get<QueryOptimizer>(QueryOptimizer);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeWithTiming', () => {
    it('should execute query function and return result', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue('test-result');
      
      const result = await service.executeWithTiming(
        mockQueryFn,
        'SELECT',
        'test_table'
      );
      
      expect(result).toBe('test-result');
      expect(mockQueryFn).toHaveBeenCalled();
    });

    it('should handle query errors', async () => {
      const mockError = new Error('Database error');
      const mockQueryFn = jest.fn().mockRejectedValue(mockError);
      
      await expect(
        service.executeWithTiming(mockQueryFn, 'SELECT', 'test_table')
      ).rejects.toThrow('Database error');
    });

    it('should execute fast queries without warnings', async () => {
      const mockQueryFn = jest.fn().mockResolvedValue('fast-result');
      
      const result = await service.executeWithTiming(
        mockQueryFn,
        'SELECT',
        'test_table'
      );
      
      expect(result).toBe('fast-result');
    });
  });

  describe('executeBatch', () => {
    it('should execute operations in batches', async () => {
      const operations = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockResolvedValue('result2'),
        jest.fn().mockResolvedValue('result3'),
      ];
      
      const results = await service.executeBatch(operations, 2, 0);
      
      expect(results).toEqual(['result1', 'result2', 'result3']);
      expect(operations[0]).toHaveBeenCalled();
      expect(operations[1]).toHaveBeenCalled();
      expect(operations[2]).toHaveBeenCalled();
    });

    it('should handle empty operations array', async () => {
      const results = await service.executeBatch([]);
      expect(results).toEqual([]);
    });

    it('should handle batch errors', async () => {
      const operations = [
        jest.fn().mockResolvedValue('result1'),
        jest.fn().mockRejectedValue(new Error('Batch error')),
      ];
      
      await expect(service.executeBatch(operations, 2, 0)).rejects.toThrow('Batch error');
    });
  });

  describe('buildOptimizedQuery', () => {
    it('should apply optimizations to base query', () => {
      const mockQuery = {
        limit: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
      };
      
      const result = service.buildOptimizedQuery(mockQuery);
      
      expect(mockQuery.limit).toHaveBeenCalledWith(1000);
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toBe(mockQuery);
    });
  });

  describe('validateQueryParams', () => {
    it('should validate and sanitize query parameters', () => {
      const params = {
        stringParam: '  test string  ',
        numberParam: 123,
        booleanParam: true,
        nullParam: null,
        undefinedParam: undefined,
        invalidParam: {},
        longString: 'x'.repeat(600), // Should be truncated
      };
      
      const validated = service.validateQueryParams(params);
      
      expect(validated).toEqual({
        stringParam: 'test string',
        numberParam: 123,
        booleanParam: true,
        longString: 'x'.repeat(500), // Truncated to 500 chars
      });
    });

    it('should handle empty params object', () => {
      const validated = service.validateQueryParams({});
      expect(validated).toEqual({});
    });

    it('should filter out invalid number values', () => {
      const params = {
        validNumber: 42,
        invalidNumber: NaN,
        infiniteNumber: Infinity,
      };
      
      const validated = service.validateQueryParams(params);
      
      expect(validated).toEqual({
        validNumber: 42,
      });
    });
  });
});
