import { Injectable, Logger } from '@nestjs/common';
import { DbService } from './db.service';
import { DataService } from './data.service';
import { VerifierRole } from '@/models/verifier-role.interface';

/**
 * VerificationEngine - Unified verification logic processor
 * 
 * This class consolidates all verification logic into a single, unified engine.
 * It automatically detects whether to use legacy or modern verification based
 * on rule characteristics and eliminates duplicate verification flows.
 * 
 * Key Features:
 * - **Single Entry Point**: `verifyUser()` handles all verification types transparently
 * - **Automatic Detection**: Intelligently identifies legacy vs modern rules
 * - **Unified Results**: Consistent result format regardless of rule type
 * - **Performance Optimized**: Efficient database queries with minimal redundancy
 * - **Comprehensive Logging**: Detailed verification flow tracking for debugging
 * - **Error Resilience**: Graceful handling of various failure scenarios
 * 
 * Architecture Benefits:
 * - Eliminates code duplication between legacy and modern verification flows
 * - Provides single point of maintenance for verification logic
 * - Enables easy addition of new verification types in the future
 * - Centralizes performance optimizations and caching strategies
 * 
 * @example
 * ```typescript
 * const result = await verificationEngine.verifyUser(
 *   'discord_user_123',
 *   'rule_456', 
 *   '0x742d35cc6634c0532925a3b8d3aa3e3cf9fbc4f4'
 * );
 * 
 * if (result.isValid) {
 *   console.log(`User verified with ${result.matchingAssetCount} matching assets`);
 * }
 * ```
 */
@Injectable()
export class VerificationEngine {
  constructor(
    private readonly dbSvc: DbService,
    private readonly dataSvc: DataService,
  ) {}

  /**
   * Main verification method - unified entry point for all verification types
   * 
   * Automatically detects the rule type (legacy vs modern) and applies the appropriate
   * verification logic. This method provides a single, consistent interface for
   * verification regardless of the underlying rule structure.
   * 
   * Process Flow:
   * 1. Fetch and validate the rule exists
   * 2. Automatically detect rule type (legacy vs modern)
   * 3. Apply appropriate verification logic based on rule type
   * 4. Query user's asset holdings from marketplace
   * 5. Match holdings against rule criteria
   * 6. Return detailed verification result
   * 
   * @param userId - Discord user ID requesting verification
   * @param ruleId - Rule ID to verify against (supports both string and number)
   * @param address - Ethereum wallet address to verify asset ownership for
   * @returns Promise<VerificationResult> - Comprehensive verification outcome
   * 
   * @example
   * ```typescript
   * // Modern rule verification
   * const result = await engine.verifyUser('123456789', 'rule_001', '0x742d35cc...');
   * 
   * // Legacy rule verification (handled transparently)
   * const legacyResult = await engine.verifyUser('987654321', 42, '0x123abc...');
   * 
   * // Handle results uniformly
   * if (result.isValid) {
   *   console.log(`Verification passed: ${result.matchingAssetCount} assets found`);
   * } else {
   *   console.log(`Verification failed: ${result.error}`);
   * }
   * ```
   */
  async verifyUser(
    userId: string, 
    ruleId: string | number, 
    address: string
  ): Promise<VerificationResult> {
    try {
      Logger.debug(`VerificationEngine: Starting verification for user ${userId} with rule ${ruleId} and address ${address}`);
      
      // Fetch the rule details
      const rule = await this.getRuleById(ruleId);
      if (!rule) {
        return {
          isValid: false,
          ruleType: 'unknown',
          error: `Rule ${ruleId} not found`,
          userId,
          ruleId,
          address
        };
      }

      // Determine rule type and apply appropriate verification logic
      const ruleType = this.detectRuleType(rule);
      Logger.debug(`VerificationEngine: Detected rule type '${ruleType}' for rule ${ruleId}`);

      let verificationResult: VerificationResult;

      switch (ruleType) {
        case 'legacy':
          verificationResult = await this.verifyLegacy(userId, rule, address);
          break;
        case 'modern':
          verificationResult = await this.verifyModern(userId, rule, address);
          break;
        default:
          verificationResult = {
            isValid: false,
            ruleType: 'unknown',
            error: `Unsupported rule type: ${ruleType}`,
            userId,
            ruleId,
            address
          };
      }

      Logger.debug(`VerificationEngine: Verification result for user ${userId}: ${verificationResult.isValid ? 'PASS' : 'FAIL'}`);
      return verificationResult;

    } catch (error) {
      Logger.error(`VerificationEngine: Error verifying user ${userId} with rule ${ruleId}:`, error);
      return {
        isValid: false,
        ruleType: 'error',
        error: error.message || 'Unknown verification error',
        userId,
        ruleId,
        address
      };
    }
  }

  /**
   * Verify multiple rules for a user (bulk verification)
   * 
   * @param userId - Discord user ID
   * @param ruleIds - Array of rule IDs to verify against
   * @param address - Ethereum address to verify
   * @returns Promise<BulkVerificationResult> with results for all rules
   */
  async verifyUserBulk(
    userId: string,
    ruleIds: (string | number)[],
    address: string
  ): Promise<BulkVerificationResult> {
    Logger.debug(`VerificationEngine: Starting bulk verification for user ${userId} with ${ruleIds.length} rules`);
    
    const results: VerificationResult[] = [];
    const validRules: VerifierRole[] = [];
    const invalidRules: VerifierRole[] = [];
    const matchingAssetCounts = new Map<string, number>();

    for (const ruleId of ruleIds) {
      const result = await this.verifyUser(userId, ruleId, address);
      results.push(result);

      if (result.isValid && result.rule) {
        validRules.push(result.rule);
        if (result.matchingAssetCount) {
          matchingAssetCounts.set(result.ruleId.toString(), result.matchingAssetCount);
        }
      } else if (result.rule) {
        invalidRules.push(result.rule);
      }
    }

    return {
      userId,
      address,
      totalRules: ruleIds.length,
      validRules,
      invalidRules,
      matchingAssetCounts,
      results
    };
  }

  /**
   * Verify user against all rules for a specific server
   * 
   * @param userId - Discord user ID
   * @param serverId - Discord server ID
   * @param address - Ethereum address to verify
   * @returns Promise<BulkVerificationResult> with results for all server rules
   */
  async verifyUserForServer(
    userId: string,
    serverId: string,
    address: string
  ): Promise<BulkVerificationResult> {
    Logger.debug(`VerificationEngine: Starting server-wide verification for user ${userId} in server ${serverId}`);
    
    const rules = await this.dbSvc.getRoleMappings(serverId);
    const ruleIds = rules.map(rule => rule.id);
    
    return await this.verifyUserBulk(userId, ruleIds, address);
  }

  /**
   * Detect whether a rule is legacy or modern based on its characteristics
   * 
   * @param rule - The verification rule to analyze
   * @returns 'legacy' | 'modern' | 'unknown'
   */
  private detectRuleType(rule: VerifierRole): 'legacy' | 'modern' | 'unknown' {
    // Legacy rule indicators
    if (
      rule.slug === 'legacy_collection' ||
      rule.attribute_key === 'legacy_attribute' ||
      (typeof rule.id === 'string' && rule.id === 'LEGACY')
    ) {
      return 'legacy';
    }

    // Modern rule indicators (has specific targeting criteria)
    if (
      rule.slug &&
      rule.slug !== 'legacy_collection' &&
      (rule.attribute_key || rule.attribute_value || rule.min_items)
    ) {
      return 'modern';
    }

    // Fallback to modern for rules with basic structure
    if (rule.slug && rule.id) {
      return 'modern';
    }

    return 'unknown';
  }

  /**
   * Legacy verification logic - broad asset ownership check
   * 
   * @param userId - Discord user ID
   * @param rule - Legacy verification rule
   * @param address - Ethereum address to verify
   * @returns Promise<VerificationResult>
   */
  private async verifyLegacy(
    userId: string,
    rule: VerifierRole,
    address: string
  ): Promise<VerificationResult> {
    Logger.debug(`VerificationEngine: Executing legacy verification for address ${address}`);
    
    try {
      // Legacy verification: check ownership of any assets from any collection
      const assetCount = await this.dataSvc.checkAssetOwnershipWithCriteria(
        address,
        'ALL', // Check all collections
        'ALL', // All attributes
        'ALL', // All values
        1      // At least 1 asset
      );

      const isValid = assetCount > 0;
      
      Logger.debug(`VerificationEngine: Legacy verification ${isValid ? 'PASSED' : 'FAILED'} - found ${assetCount} assets`);
      
      return {
        isValid,
        ruleType: 'legacy',
        userId,
        ruleId: rule.id,
        address,
        rule,
        matchingAssetCount: assetCount,
        verificationDetails: {
          collection: 'ALL',
          attributeKey: 'ALL',
          attributeValue: 'ALL',
          minItems: 1,
          foundAssets: assetCount
        }
      };
    } catch (error) {
      Logger.error(`VerificationEngine: Legacy verification error for address ${address}:`, error);
      return {
        isValid: false,
        ruleType: 'legacy',
        userId,
        ruleId: rule.id,
        address,
        rule,
        error: error.message || 'Legacy verification failed'
      };
    }
  }

  /**
   * Modern verification logic - specific criteria-based checking
   * 
   * @param userId - Discord user ID
   * @param rule - Modern verification rule with specific criteria
   * @param address - Ethereum address to verify
   * @returns Promise<VerificationResult>
   */
  private async verifyModern(
    userId: string,
    rule: VerifierRole,
    address: string
  ): Promise<VerificationResult> {
    Logger.debug(`VerificationEngine: Executing modern verification for rule ${rule.id} and address ${address}`);
    Logger.debug(`VerificationEngine: Criteria - collection:${rule.slug}, attr:${rule.attribute_key}=${rule.attribute_value}, min:${rule.min_items}`);
    
    try {
      // Modern verification: check ownership based on specific criteria
      const assetCount = await this.dataSvc.checkAssetOwnershipWithCriteria(
        address,
        rule.slug || 'ALL',
        rule.attribute_key || 'ALL',
        rule.attribute_value || 'ALL',
        rule.min_items || 1
      );

      const requiredCount = rule.min_items || 1;
      const isValid = assetCount >= requiredCount;
      
      Logger.debug(`VerificationEngine: Modern verification ${isValid ? 'PASSED' : 'FAILED'} - found ${assetCount} assets, needed ${requiredCount}`);
      
      return {
        isValid,
        ruleType: 'modern',
        userId,
        ruleId: rule.id,
        address,
        rule,
        matchingAssetCount: assetCount,
        verificationDetails: {
          collection: rule.slug || 'ALL',
          attributeKey: rule.attribute_key || 'ALL',
          attributeValue: rule.attribute_value || 'ALL',
          minItems: requiredCount,
          foundAssets: assetCount
        }
      };
    } catch (error) {
      Logger.error(`VerificationEngine: Modern verification error for rule ${rule.id}:`, error);
      return {
        isValid: false,
        ruleType: 'modern',
        userId,
        ruleId: rule.id,
        address,
        rule,
        error: error.message || 'Modern verification failed'
      };
    }
  }

  /**
   * Fetch rule by ID from database
   * 
   * @param ruleId - Rule ID (string or number)
   * @returns Promise<VerifierRole | null>
   */
  private async getRuleById(ruleId: string | number): Promise<VerifierRole | null> {
    try {
      const ruleIdStr = typeof ruleId === 'number' ? ruleId.toString() : ruleId;
      return await this.dbSvc.getRuleById(ruleIdStr);
    } catch (error) {
      Logger.error(`VerificationEngine: Error fetching rule ${ruleId}:`, error);
      return null;
    }
  }
}

/**
 * VerificationResult - Comprehensive verification outcome
 * 
 * Unified result interface that provides consistent data structure
 * regardless of the verification rule type (legacy or modern).
 * 
 * @interface VerificationResult
 * @property isValid - Whether the verification passed or failed
 * @property ruleType - Type of rule processed ('legacy', 'modern', 'unknown', 'error')
 * @property userId - Discord user ID that was verified
 * @property ruleId - Rule ID that was applied (string or number)
 * @property address - Ethereum address that was verified
 * @property rule - Full rule object that was applied (optional)
 * @property matchingAssetCount - Number of assets that matched the rule criteria (optional)
 * @property error - Error message if verification failed (optional)
 * @property verificationDetails - Detailed breakdown of verification criteria and results (optional)
 */
export interface VerificationResult {
  isValid: boolean;
  ruleType: 'legacy' | 'modern' | 'unknown' | 'error';
  userId: string;
  ruleId: string | number;
  address: string;
  rule?: VerifierRole;
  matchingAssetCount?: number;
  error?: string;
  verificationDetails?: {
    collection: string;
    attributeKey: string;
    attributeValue: string;
    minItems: number;
    foundAssets: number;
  };
}

/**
 * BulkVerificationResult - Results for verifying multiple rules at once
 * 
 * Provides comprehensive results when verifying a user against multiple
 * verification rules simultaneously. Useful for bulk operations and
 * determining all roles a user should have.
 * 
 * @interface BulkVerificationResult
 * @property userId - Discord user ID that was verified
 * @property address - Ethereum address that was verified
 * @property totalRules - Total number of rules that were checked
 * @property validRules - Array of rules that the user passed verification for
 * @property invalidRules - Array of rules that the user failed verification for
 * @property matchingAssetCounts - Map of rule IDs to number of matching assets
 * @property results - Array of individual VerificationResult objects for each rule
 */
export interface BulkVerificationResult {
  userId: string;
  address: string;
  totalRules: number;
  validRules: VerifierRole[];
  invalidRules: VerifierRole[];
  matchingAssetCounts: Map<string, number>;
  results: VerificationResult[];
}
