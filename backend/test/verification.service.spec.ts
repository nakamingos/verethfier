import { Test, TestingModule } from '@nestjs/testing';
import { VerificationService } from '../src/services/verification.service';
import { DbService } from '../src/services/db.service';
import { DataService } from '../src/services/data.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';

describe('VerificationService', () => {
  let service: VerificationService;
  let mockDbService: jest.Mocked<Partial<DbService>>;
  let mockDataService: jest.Mocked<Partial<DataService>>;
  let mockDiscordVerificationService: jest.Mocked<Partial<DiscordVerificationService>>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: DbService, useValue: mockDbService },
        { provide: DataService, useValue: mockDataService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
      ],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
  });

  describe('verifyUserAgainstRule', () => {
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

      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(3);

      const result = await service.verifyUserAgainstRule('0xabc', rule);

      expect(result.isValid).toBe(true);
      expect(result.matchingAssetCount).toBe(3);
      expect(mockDataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledWith(
        '0xabc',
        'test-collection',
        'trait', 
        'rare',
        2
      );
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

      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(5);

      const result = await service.verifyUserAgainstRule('0xdef', legacyRule);

      expect(result.isValid).toBe(true);
      expect(result.matchingAssetCount).toBe(5);
      expect(mockDataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledWith(
        '0xdef',
        'ALL',
        'ALL',
        'ALL',
        1
      );
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

      mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(3); // Less than required

      const result = await service.verifyUserAgainstRule('0xabc', rule);

      expect(result.isValid).toBe(false);
      expect(result.matchingAssetCount).toBe(3);
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
});
