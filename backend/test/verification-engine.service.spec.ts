import { Test, TestingModule } from '@nestjs/testing';
import { VerificationEngine, VerificationResult, BulkVerificationResult } from '../src/services/verification-engine.service';
import { DbService } from '../src/services/db.service';
import { DataService } from '../src/services/data.service';
import { VerifierRole } from '../src/models/verifier-role.interface';

describe('VerificationEngine', () => {
  let engine: VerificationEngine;
  let mockDbService: jest.Mocked<Partial<DbService>>;
  let mockDataService: jest.Mocked<Partial<DataService>>;

  beforeEach(async () => {
    mockDbService = {
      getRuleById: jest.fn(),
      getRoleMappings: jest.fn(),
    };

    mockDataService = {
      checkAssetOwnershipWithCriteria: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationEngine,
        { provide: DbService, useValue: mockDbService },
        { provide: DataService, useValue: mockDataService },
      ],
    }).compile();

    engine = module.get<VerificationEngine>(VerificationEngine);
  });

  describe('verifyUser', () => {
    it('should verify modern rule successfully', async () => {
      const rule: VerifierRole = {
        id: 1,
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 2,
        role_id: 'role-123',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Test Role'
      };

      mockDbService.getRuleById.mockResolvedValue(rule);
      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(3);

      const result = await engine.verifyUser('user-123', 1, '0xabc');

      expect(result.isValid).toBe(true);
      expect(result.ruleType).toBe('modern');
      expect(result.matchingAssetCount).toBe(3);
      expect(result.verificationDetails).toEqual({
        collection: 'test-collection',
        attributeKey: 'trait',
        attributeValue: 'rare',
        minItems: 2,
        foundAssets: 3
      });
      expect(mockDataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledWith(
        '0xabc',
        'test-collection',
        'trait',
        'rare',
        2
      );
    });

    it('should verify legacy rule successfully', async () => {
      const legacyRule: VerifierRole = {
        id: 2,
        slug: 'legacy_collection',
        attribute_key: 'legacy_attribute',
        attribute_value: 'legacy_value',
        min_items: 1,
        role_id: 'legacy-role',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Legacy Role'
      };

      mockDbService.getRuleById.mockResolvedValue(legacyRule);
      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(5);

      const result = await engine.verifyUser('user-123', 2, '0xdef');

      expect(result.isValid).toBe(true);
      expect(result.ruleType).toBe('legacy');
      expect(result.matchingAssetCount).toBe(5);
      expect(result.verificationDetails).toEqual({
        collection: 'ALL',
        attributeKey: 'ALL',
        attributeValue: 'ALL',
        minItems: 1,
        foundAssets: 5
      });
      expect(mockDataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledWith(
        '0xdef',
        'ALL',
        'ALL',
        'ALL',
        1
      );
    });

    it('should fail verification when user does not meet modern rule criteria', async () => {
      const rule: VerifierRole = {
        id: 3,
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 5,
        role_id: 'role-123',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Test Role'
      };

      mockDbService.getRuleById.mockResolvedValue(rule);
      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(3); // Less than required

      const result = await engine.verifyUser('user-123', 3, '0xfailed');

      expect(result.isValid).toBe(false);
      expect(result.ruleType).toBe('modern');
      expect(result.matchingAssetCount).toBe(3);
      expect(result.verificationDetails?.foundAssets).toBe(3);
      expect(result.verificationDetails?.minItems).toBe(5);
    });

    it('should fail verification when user has no assets for legacy rule', async () => {
      const legacyRule: VerifierRole = {
        id: 4,
        slug: 'legacy_collection',
        attribute_key: 'legacy_attribute',
        attribute_value: 'legacy_value',
        min_items: 1,
        role_id: 'legacy-role',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Legacy Role'
      };

      mockDbService.getRuleById.mockResolvedValue(legacyRule);
      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(0);

      const result = await engine.verifyUser('user-123', 4, '0xempty');

      expect(result.isValid).toBe(false);
      expect(result.ruleType).toBe('legacy');
      expect(result.matchingAssetCount).toBe(0);
    });

    it('should handle rule not found', async () => {
      mockDbService.getRuleById.mockResolvedValue(null);

      const result = await engine.verifyUser('user-123', 999, '0xabc');

      expect(result.isValid).toBe(false);
      expect(result.ruleType).toBe('unknown');
      expect(result.error).toBe('Rule 999 not found');
    });

    it('should handle verification errors', async () => {
      const rule: VerifierRole = {
        id: 5,
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
        role_id: 'role-123',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Test Role',
      };

      mockDbService.getRuleById.mockResolvedValue(rule);
      mockDataService.checkAssetOwnershipWithCriteria.mockRejectedValue(new Error('Asset check failed'));

      const result = await engine.verifyUser('user-123', 5, '0xabc');

      expect(result.isValid).toBe(false);
      expect(result.ruleType).toBe('modern');
      expect(result.error).toBe('Asset check failed');
    });
  });

  describe('verifyUserBulk', () => {
    it('should verify user against multiple rules', async () => {
      const rule1: VerifierRole = {
        id: 1,
        slug: 'collection1',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
        role_id: 'role-1',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Role 1',
      };

      const rule2: VerifierRole = {
        id: 2,
        slug: 'legacy_collection',
        attribute_key: 'legacy_attribute',
        attribute_value: 'legacy_value',
        min_items: 1,
        role_id: 'role-2',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Role 2',
      };

      mockDbService.getRuleById
        .mockResolvedValueOnce(rule1)
        .mockResolvedValueOnce(rule2);

      mockDataService.checkAssetOwnershipWithCriteria
        .mockResolvedValueOnce(2) // Valid for rule1
        .mockResolvedValueOnce(0); // Invalid for rule2

      const result = await engine.verifyUserBulk('user-123', [1, 2], '0xabc');

      expect(result.totalRules).toBe(2);
      expect(result.validRules).toHaveLength(1);
      expect(result.invalidRules).toHaveLength(1);
      expect(result.validRules[0].id).toBe(1);
      expect(result.invalidRules[0].id).toBe(2);
      expect(result.matchingAssetCounts.get('1')).toBe(2);
    });
  });

  describe('verifyUserForServer', () => {
    it('should verify user against all server rules', async () => {
      const serverRules: VerifierRole[] = [
        {
          id: 1,
          slug: 'collection1',
          attribute_key: 'trait',
          attribute_value: 'rare',
          min_items: 1,
          role_id: 'role-1',
          server_id: 'server-123',
          channel_id: 'channel-123',
          server_name: 'Test Server',
          channel_name: 'Test Channel',
          role_name: 'Role 1',
        }
      ];

      mockDbService.getRoleMappings.mockResolvedValue(serverRules);
      mockDbService.getRuleById.mockResolvedValue(serverRules[0]);
      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(3);

      const result = await engine.verifyUserForServer('user-123', 'server-123', '0xabc');

      expect(result.totalRules).toBe(1);
      expect(result.validRules).toHaveLength(1);
      expect(result.invalidRules).toHaveLength(0);
      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('server-123');
    });
  });

  describe('detectRuleType', () => {
    it('should detect legacy rules', () => {
      const legacyRule: VerifierRole = {
        id: 1,
        slug: 'legacy_collection',
        attribute_key: 'test',
        attribute_value: 'test',
        min_items: 1,
        role_id: 'role-1',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Test Role',
      };

      // Use a test method to access the private method
      const ruleType = (engine as any).detectRuleType(legacyRule);
      expect(ruleType).toBe('legacy');
    });

    it('should detect modern rules', () => {
      const modernRule: VerifierRole = {
        id: 1,
        slug: 'modern-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 2,
        role_id: 'role-1',
        server_id: 'server-123',
        channel_id: 'channel-123',
        server_name: 'Test Server',
        channel_name: 'Test Channel',
        role_name: 'Test Role',
      };

      const ruleType = (engine as any).detectRuleType(modernRule);
      expect(ruleType).toBe('modern');
    });
  });
});
