/**
 * Centralized error handling utilities for the application
 */

export class ErrorType {
  static readonly VALIDATION_ERROR = 'ValidationError';
  static readonly DATABASE_ERROR = 'DatabaseError';
  static readonly DISCORD_API_ERROR = 'DiscordApiError';
  static readonly VERIFICATION_ERROR = 'VerificationError';
  static readonly CACHE_ERROR = 'CacheError';
  static readonly NETWORK_ERROR = 'NetworkError';
  static readonly AUTHORIZATION_ERROR = 'AuthorizationError';
}

export interface StructuredError {
  type: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export class ApplicationError extends Error {
  public readonly type: string;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    type: string,
    message: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApplicationError.prototype);
  }

  toStructured(): StructuredError {
    return {
      type: this.type,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Factory functions for creating specific error types
 */
export const ErrorFactory = {
  validation: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.VALIDATION_ERROR, message, 'VAL_001', details),

  database: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.DATABASE_ERROR, message, 'DB_001', details),

  discordApi: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.DISCORD_API_ERROR, message, 'DISC_001', details),

  verification: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.VERIFICATION_ERROR, message, 'VER_001', details),

  cache: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.CACHE_ERROR, message, 'CACHE_001', details),

  network: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.NETWORK_ERROR, message, 'NET_001', details),

  authorization: (message: string, details?: Record<string, unknown>) =>
    new ApplicationError(ErrorType.AUTHORIZATION_ERROR, message, 'AUTH_001', details),
};
