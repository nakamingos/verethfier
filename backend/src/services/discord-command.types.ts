import { TextChannel, Role } from 'discord.js';

/**
 * Rule creation data interface
 * Contains all the necessary information to create a verification rule
 */
export interface RuleCreationData {
  channel: TextChannel;
  role: Role;
  slug: string;
  attributeKey: string;
  attributeValue: string;
  minItems: number;
}

/**
 * Duplicate rule context interface
 * Used when handling duplicate rule warnings and confirmations
 */
export interface DuplicateRuleContext {
  existingRule: any;
  newRuleData: RuleCreationData;
}

/**
 * Service operation result interfaces
 * Standardized return types for service operations
 */
export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  errorResponse?: any;
  message?: string;
}

export interface ValidationResult {
  valid: boolean;
  errorResponse?: any;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingRule?: any;
  errorResponse?: any;
}

export interface RoleOperationResult {
  success: boolean;
  role?: Role;
  wasCreated?: boolean;
  errorResponse?: any;
}

export interface RuleCreationResult {
  success: boolean;
  ruleId?: number;
  messageId?: string;
  errorResponse?: any;
}
