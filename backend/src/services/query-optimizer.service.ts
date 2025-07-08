import { Injectable } from '@nestjs/common';
import { AppLogger } from '@/utils/app-logger.util';

/**
 * Database query optimization utilities
 * Provides helpers for query performance monitoring and optimization
 */
@Injectable()
export class QueryOptimizer {
  
  /**
   * Execute a database query with performance monitoring
   */
  async executeWithTiming<T>(
    queryFn: () => Promise<T>,
    operation: string,
    table: string
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const duration = Date.now() - startTime;
      
      AppLogger.logDbOperation(operation, table, duration);
      
      // Log slow queries for optimization
      if (duration > 1000) { // > 1 second
        AppLogger.warn(`Slow query detected: ${operation} on ${table} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      AppLogger.error(`Query failed: ${operation} on ${table} after ${duration}ms`, error.message);
      throw error;
    }
  }

  /**
   * Batch database operations to reduce round trips
   */
  async executeBatch<T>(
    operations: Array<() => Promise<T>>,
    batchSize: number = 10,
    delayBetweenBatches: number = 100
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
      
      // Add delay between batches to prevent overwhelming the database
      if (i + batchSize < operations.length && delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    return results;
  }

  /**
   * Create optimized query builder with common options
   */
  buildOptimizedQuery(baseQuery: any): any {
    return baseQuery
      .limit(1000) // Prevent accidental large queries
      .order('created_at', { ascending: false }); // Default ordering for consistent results
  }

  /**
   * Validate query parameters to prevent injection attacks
   */
  validateQueryParams(params: Record<string, any>): Record<string, any> {
    const validated: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(params)) {
      if (value !== null && value !== undefined) {
        // Sanitize string values
        if (typeof value === 'string') {
          validated[key] = value.trim().slice(0, 500); // Limit string length
        } else if (typeof value === 'number' && !isNaN(value)) {
          validated[key] = value;
        } else if (typeof value === 'boolean') {
          validated[key] = value;
        }
        // Skip invalid types
      }
    }
    
    return validated;
  }
}
