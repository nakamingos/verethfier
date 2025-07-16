import { Logger } from '@nestjs/common';

/**
 * Centralized logging utility with performance optimizations
 * Provides conditional logging based on environment and log levels
 */
export class AppLogger {
  private static readonly isProduction = process.env.NODE_ENV === 'production';
  private static readonly isTest = Number(process.env.IS_TEST) === 1;

  /**
   * Debug logging - only logs in non-production environments
   */
  static debug(message: any, context?: string): void {
    if (!this.isProduction && !this.isTest) {
      Logger.debug(message, context);
    }
  }

  /**
   * Info logging - logs in all environments except test
   */
  static log(message: any, context?: string): void {
    if (!this.isTest) {
      Logger.log(message, context);
    }
  }

  /**
   * Warning logging - always logs
   */
  static warn(message: any, context?: string): void {
    Logger.warn(message, context);
  }

  /**
   * Error logging - always logs
   */
  static error(message: any, trace?: string, context?: string): void {
    Logger.error(message, trace, context);
  }

  /**
   * Verbose logging - only in development
   */
  static verbose(message: any, context?: string): void {
    if (!this.isProduction && !this.isTest) {
      Logger.verbose(message, context);
    }
  }

  /**
   * Performance logging with timing
   */
  static logWithTiming(operation: string, startTime: number, context?: string): void {
    const duration = Date.now() - startTime;
    this.debug(`${operation} completed in ${duration}ms`, context);
  }

  /**
   * Database operation logging
   */
  static logDbOperation(operation: string, table: string, duration?: number): void {
    const message = duration 
      ? `DB ${operation} on ${table} (${duration}ms)`
      : `DB ${operation} on ${table}`;
    this.debug(message, 'Database');
  }

  /**
   * API request logging
   */
  static logApiRequest(method: string, path: string, statusCode?: number): void {
    const message = statusCode 
      ? `${method} ${path} - ${statusCode}`
      : `${method} ${path}`;
    this.log(message, 'API');
  }
}
