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
 * - Single method `verifyUser()` handles all verification types
 * - Automatic detection of legacy vs modern rules
 * - Unified result format for all verification types
 * - Centralized logging and error handling
 * - Performance optimized with caching capabilities
 */
@Injectable()
export class VerificationEngine {
  constructor(
    private readonly dbSvc: DbService,
    private readonly dataSvc: DataService,
  ) {}

  /**
   * Main verification method - automatically detects rule type and applies appropriate logic
   * 
   * @param userId - Discord user ID requesting verification
   * @param ruleId - Rule ID to verify against (string or number)
   * @param address - Ethereum address to verify ownership for
   * @returns Promise<VerificationResult> with verification outcome and metadata
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
 * Unified verification result interface
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
 * Bulk verification result interface
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
