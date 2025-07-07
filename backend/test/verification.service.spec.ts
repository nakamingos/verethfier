import { Test, TestingModule } from '@nestjs/testing';
import { VerificationService } from '../src/services/verification.service';
import { VerificationEngine } from '../src/services/verification-engine.service';
import { DbService } from '../src/services/db.service';
import { DataService } from '../src/services/data.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';

describe('VerificationService', () => {
  let service: VerificationService;
  let mockDbService: jest.Mocked<Partial<DbService>>;
  let mockDataService: jest.Mocked<Partial<DataService>>;
  let mockDiscordVerificationService: jest.Mocked<Partial<DiscordVerificationService>>;
  let mockVerificationEngine: jest.Mocked<Partial<VerificationEngine>>;

  beforeEach(async () => {
    mockDbService = {
      getRoleMappings: jest.fn(),
      findRulesByMessageId: jest.fn(),
      getRulesByChannel: jest.fn(),
      logUserRole: jest.fn(),
      getRuleById: jest.fn(),
      updateRoleVerification: jest.fn(),
      getActiveRoleAssignments: jest.fn(),
      getUserRoleHistory: jest.fn(),
      ruleExists: jest.fn(),
      addRoleMapping: jest.fn(),
      deleteRoleMapping: jest.fn(),
      findRuleWithMessage: jest.fn(),
      updateRuleMessageId: jest.fn(),
      checkForDuplicateRule: jest.fn(),
    };

    mockDataService = {
      checkAssetOwnershipWithCriteria: jest.fn(),
    };

    mockDiscordVerificationService = {};

    mockVerificationEngine = {
      verifyUser: jest.fn(),
      verifyUserBulk: jest.fn(),
      verifyUserForServer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: DbService, useValue: mockDbService },
        { provide: DataService, useValue: mockDataService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
        { provide: VerificationEngine, useValue: mockVerificationEngine },
      ],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
  });

  describe('verifyUserAgainstRule (legacy method)', () => {
    it('should verify modern rule successfully', async () => {
      const rule = {
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
        role_name: 'Test Role',
        message_id: null
      };

      // Mock the VerificationEngine response
      mockVerificationEngine.verifyUser.mockResolvedValue({
        isValid: true,
        ruleType: 'modern',
        userId: 'unknown',
        ruleId: 1,
        address: '0xabc',
        rule,
        matchingAssetCount: 3
      });

      const result = await service.verifyUserAgainstRule('0xabc', rule);

      expect(result.isValid).toBe(true);
      expect(result.matchingAssetCount).toBe(3);
      expect(mockVerificationEngine.verifyUser).toHaveBeenCalledWith('unknown', 1, '0xabc');
    });

    it('should verify legacy rule successfully', async () => {
      const legacyRule = {
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
        role_name: 'Legacy Role',
        message_id: null
      };

      // Mock the VerificationEngine response for legacy rule
      mockVerificationEngine.verifyUser.mockResolvedValue({
        isValid: true,
        ruleType: 'legacy',
        userId: 'unknown',
        ruleId: 2,
        address: '0xdef',
        rule: legacyRule,
        matchingAssetCount: 5
      });

      const result = await service.verifyUserAgainstRule('0xdef', legacyRule);

      expect(result.isValid).toBe(true);
      expect(result.matchingAssetCount).toBe(5);
      expect(mockVerificationEngine.verifyUser).toHaveBeenCalledWith('unknown', 2, '0xdef');
    });

    it('should fail verification when user does not meet criteria', async () => {
      const rule = {
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
        role_name: 'Test Role',
        message_id: null
      };

      // Mock the VerificationEngine response for failed verification
      mockVerificationEngine.verifyUser.mockResolvedValue({
        isValid: false,
        ruleType: 'modern',
        userId: 'unknown',
        ruleId: 3,
        address: '0xfailed',
        rule,
        matchingAssetCount: 3
      });

      const result = await service.verifyUserAgainstRule('0xfailed', rule);

      expect(result.isValid).toBe(false);
      expect(result.matchingAssetCount).toBe(3);
      expect(mockVerificationEngine.verifyUser).toHaveBeenCalledWith('unknown', 3, '0xfailed');
    });
  });

  describe('getAllRulesForServer', () => {
    it('should return rules from unified database', async () => {
      const mockRules = [
        { id: 1, slug: 'collection1', server_id: 'server-123' },
        { id: 2, slug: 'legacy_collection', server_id: 'server-123' }
      ];

      mockDbService.getRoleMappings.mockResolvedValue(mockRules);

      const result = await service.getAllRulesForServer('server-123');

      expect(result).toEqual(mockRules);
      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('server-123');
    });
  });

  describe('assignRoleToUser', () => {
    it('should log role assignment with metadata', async () => {
      mockDbService.logUserRole.mockResolvedValue(undefined);

      await service.assignRoleToUser(
        'user-123',
        'server-123',
        'role-123',
        '0xabc',
        'rule-123',
        {
          userName: 'TestUser',
          serverName: 'TestServer',
          roleName: 'TestRole'
        }
      );

      expect(mockDbService.logUserRole).toHaveBeenCalledWith(
        'user-123',
        'server-123',
        'role-123',
        '0xabc',
        'TestUser',
        'TestServer',
        'TestRole'
      );
    });
  });

  describe('verifyUser (new unified method)', () => {
    it('should verify user using VerificationEngine', async () => {
      const mockResult = {
        isValid: true,
        ruleType: 'modern' as const,
        userId: 'user-123',
        ruleId: 1,
        address: '0xabc',
        matchingAssetCount: 5
      };

      mockVerificationEngine.verifyUser.mockResolvedValue(mockResult);

      const result = await service.verifyUser('user-123', 1, '0xabc');

      expect(result).toEqual(mockResult);
      expect(mockVerificationEngine.verifyUser).toHaveBeenCalledWith('user-123', 1, '0xabc');
    });
  });

  describe('verifyUserBulk', () => {
    it('should verify user against multiple rules using VerificationEngine', async () => {
      const mockResult = {
        userId: 'user-123',
        address: '0xabc',
        totalRules: 2,
        validRules: [],
        invalidRules: [],
        matchingAssetCounts: new Map(),
        results: []
      };

      mockVerificationEngine.verifyUserBulk.mockResolvedValue(mockResult);

      const result = await service.verifyUserBulk('user-123', [1, 2], '0xabc');

      expect(result).toEqual(mockResult);
      expect(mockVerificationEngine.verifyUserBulk).toHaveBeenCalledWith('user-123', [1, 2], '0xabc');
    });
  });

  describe('verifyWallet', () => {
    it('should verify wallet using server verification', async () => {
      const mockData = {
        address: '0xabc',
        userId: 'user-123',
        userTag: 'user#1234',
        avatar: 'avatar-url',
        discordId: 'server-123',
        discordName: 'Test Server',
        discordIcon: 'icon-url',
        role: 'role-123',
        roleName: 'Test Role',
        nonce: 'test-nonce',
        expiry: 1234567890
      };

      const mockResult = {
        userId: 'user-123',
        address: '0xabc',
        totalRules: 1,
        validRules: [],
        invalidRules: [],
        matchingAssetCounts: new Map(),
        results: []
      };

      mockVerificationEngine.verifyUserForServer.mockResolvedValue(mockResult);

      const result = await service.verifyWallet(mockData);

      expect(result).toEqual(mockResult);
      expect(mockVerificationEngine.verifyUserForServer).toHaveBeenCalledWith('user-123', 'server-123', '0xabc');
    });
  });
});
