import { Test, TestingModule } from '@nestjs/testing';
import { DynamicRoleService } from '../src/services/dynamic-role.service';
import { DbService } from '../src/services/db.service';
import { DataService } from '../src/services/data.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';
import { DiscordService } from '../src/services/discord.service';
import { Logger } from '@nestjs/common';

describe('DynamicRoleService', () => {
  let service: DynamicRoleService;
  let dbService: jest.Mocked<DbService>;
  let dataService: jest.Mocked<DataService>;
  let discordVerificationService: jest.Mocked<DiscordVerificationService>;
  let discordService: jest.Mocked<DiscordService>;

  beforeEach(async () => {
    const mockDbService = {
      getActiveRoleAssignments: jest.fn(),
      updateRoleVerification: jest.fn(),
      revokeRoleAssignment: jest.fn(),
      updateLastVerified: jest.fn(),
      getUserActiveAssignments: jest.fn(),
      getRuleActiveAssignments: jest.fn(),
      updateRoleAssignmentStatus: jest.fn(),
      countActiveAssignments: jest.fn(),
      countRevokedAssignments: jest.fn(),
      countExpiringSoonAssignments: jest.fn(),
      getLastReverificationTime: jest.fn(),
      getRuleById: jest.fn(),
    };

    const mockDataService = {
      checkAssetOwnershipWithCriteria: jest.fn(),
    };

    const mockDiscordVerificationService = {
      removeUserRole: jest.fn(),
      isUserInServer: jest.fn(),
    };

    const mockDiscordService = {
      // Add any Discord service methods that might be needed
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DynamicRoleService,
        { provide: DbService, useValue: mockDbService },
        { provide: DataService, useValue: mockDataService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
        { provide: DiscordService, useValue: mockDiscordService },
      ],
    }).compile();

    service = module.get<DynamicRoleService>(DynamicRoleService);
    dbService = module.get(DbService);
    dataService = module.get(DataService);
    discordVerificationService = module.get(DiscordVerificationService);
    discordService = module.get(DiscordService);

    // Mock Logger to avoid console output during tests
    jest.spyOn(Logger, 'log').mockImplementation();
    jest.spyOn(Logger, 'debug').mockImplementation();
    jest.spyOn(Logger, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('performScheduledReverification', () => {
    it('should process active assignments and verify holdings', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          user_id: 'user1',
          server_id: 'server1',
          role_id: 'role1',
          address: '0x123',
          verifier_rules: {
            id: 'rule-1',
            slug: 'test-collection',
            attribute_key: 'trait',
            attribute_value: 'rare',
            min_items: 1,
          },
        },
        {
          id: 'assignment-2',
          user_id: 'user2',
          server_id: 'server1',
          role_id: 'role1',
          address: '0x456',
          verifier_rules: {
            id: 'rule-1',
            slug: 'test-collection',
            attribute_key: 'trait',
            attribute_value: 'rare',
            min_items: 1,
          },
        },
      ];

      dbService.getActiveRoleAssignments.mockResolvedValue(mockAssignments);
      dbService.getRuleById.mockResolvedValue({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(1); // Returns > 0 = true
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(0); // Returns 0 = false
      discordVerificationService.removeUserRole.mockResolvedValue(true);
      dbService.updateLastVerified.mockResolvedValue({});
      dbService.updateRoleAssignmentStatus.mockResolvedValue({});

      await service.performScheduledReverification();

      expect(dbService.getActiveRoleAssignments).toHaveBeenCalled();
      expect(dataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledTimes(2);
      expect(dbService.updateLastVerified).toHaveBeenCalledWith('assignment-1');
      expect(discordVerificationService.removeUserRole).toHaveBeenCalledWith('user2', 'server1', 'role1');
      expect(dbService.updateRoleAssignmentStatus).toHaveBeenCalledWith('assignment-2', 'revoked');
    });

    it('should handle errors gracefully during verification', async () => {
      const mockAssignments = [
        {
          id: 'assignment-1',
          user_id: 'user1',
          server_id: 'server1',
          role_id: 'role1',
          address: '0x123',
          rule_id: 'rule-1',
        },
      ];

      dbService.getActiveRoleAssignments.mockResolvedValue(mockAssignments);
      dbService.getRuleById.mockResolvedValue({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dataService.checkAssetOwnershipWithCriteria.mockRejectedValue(new Error('API Error'));

      // Mock Logger.error to spy on error calls
      const loggerSpy = jest.spyOn(Logger, 'error').mockImplementation();

      await service.performScheduledReverification();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Error checking qualification:',
        'API Error'
      );

      loggerSpy.mockRestore();
    });

    it('should process assignments in batches', async () => {
      const mockAssignments = Array.from({ length: 25 }, (_, i) => ({
        id: `assignment-${i}`,
        user_id: `user${i}`,
        server_id: 'server1',
        role_id: 'role1',
        address: `0x${i}`,
        rule_id: 'rule-1',
      }));

      dbService.getActiveRoleAssignments.mockResolvedValue(mockAssignments);
      dbService.getRuleById.mockResolvedValue({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValue(1); // Always returns > 0 = true
      dbService.updateLastVerified.mockResolvedValue({});

      // Mock setTimeout to avoid actual delays in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
        callback();
        return {} as any;
      });

      await service.performScheduledReverification();

      // Should process in batches of 10, so 3 batches total
      expect(dataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledTimes(25);
      expect(dbService.updateLastVerified).toHaveBeenCalledTimes(25);
    });
  });

  describe('reverifyUser', () => {
    it('should reverify all assignments for a specific user', async () => {
      const mockUserAssignments = [
        {
          id: 'assignment-1',
          user_id: 'user1',
          server_id: 'server1',
          role_id: 'role1',
          address: '0x123',
          rule_id: 'rule-1',
        },
        {
          id: 'assignment-2',
          user_id: 'user1',
          server_id: 'server2',
          role_id: 'role2',
          address: '0x123',
          rule_id: 'rule-2',
        },
      ];

      dbService.getUserActiveAssignments.mockResolvedValue(mockUserAssignments);
      dbService.getRuleById.mockResolvedValueOnce({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dbService.getRuleById.mockResolvedValueOnce({
        id: 'rule-2',
        slug: 'another-collection',
        attribute_key: 'ALL',
        attribute_value: 'ALL',
        min_items: 5,
      });
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(1); // Returns > 0 = true
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(0); // Returns 0 = false
      dbService.updateLastVerified.mockResolvedValue({});
      discordVerificationService.removeUserRole.mockResolvedValue(true);
      dbService.updateRoleAssignmentStatus.mockResolvedValue({});

      const result = await service.reverifyUser('user1');

      expect(result).toEqual({ verified: 1, revoked: 1 });
      expect(dbService.getUserActiveAssignments).toHaveBeenCalledWith('user1');
      expect(dataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledTimes(2);
    });

    it('should return zero counts when user has no assignments', async () => {
      dbService.getUserActiveAssignments.mockResolvedValue([]);

      const result = await service.reverifyUser('user1');

      expect(result).toEqual({ verified: 0, revoked: 0 });
    });
  });

  describe('reverifyRule', () => {
    it('should reverify all assignments for a specific rule', async () => {
      const mockRuleAssignments = [
        {
          id: 'assignment-1',
          user_id: 'user1',
          server_id: 'server1',
          role_id: 'role1',
          address: '0x123',
          verifier_rules: {
            id: 'rule-1',
            slug: 'test-collection',
            attribute_key: 'trait',
            attribute_value: 'rare',
            min_items: 1,
          },
        },
      ];

      dbService.getRuleActiveAssignments.mockResolvedValue(mockRuleAssignments);
      dbService.getRuleById.mockResolvedValue({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValue(0); // Returns 0 = false
      discordVerificationService.removeUserRole.mockResolvedValue(true);
      dbService.updateRoleAssignmentStatus.mockResolvedValue({});

      await service.reverifyRule('rule-1');

      expect(dbService.getRuleActiveAssignments).toHaveBeenCalledWith('rule-1');
      expect(discordVerificationService.removeUserRole).toHaveBeenCalledWith('user1', 'server1', 'role1');
      expect(dbService.updateRoleAssignmentStatus).toHaveBeenCalledWith('assignment-1', 'revoked');
    });
  });

  describe('getRoleAssignmentStats', () => {
    it('should return comprehensive statistics', async () => {
      dbService.countActiveAssignments.mockResolvedValue(50);
      dbService.countRevokedAssignments.mockResolvedValue(10);
      dbService.countExpiringSoonAssignments.mockResolvedValue(5);
      dbService.getLastReverificationTime.mockResolvedValue(new Date('2025-07-06'));

      const result = await service.getRoleAssignmentStats();

      expect(result).toEqual({
        totalActive: 50,
        totalRevoked: 10,
        expiringSoon: 5,
        lastReverificationRun: new Date('2025-07-06'),
      });
    });
  });

  describe('verifyUserStillQualifies (private method testing via public methods)', () => {
    it('should verify holdings correctly for different criteria types', async () => {
      const assignments = [
        {
          id: 'assignment-1',
          user_id: 'user1',
          address: '0x123',
          rule_id: 'rule-1',
        },
        {
          id: 'assignment-2',
          user_id: 'user1',
          address: '0x123',
          rule_id: 'rule-2',
        },
      ];

      dbService.getUserActiveAssignments.mockResolvedValue(assignments);
      dbService.getRuleById.mockResolvedValueOnce({
        id: 'rule-1',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      });
      dbService.getRuleById.mockResolvedValueOnce({
        id: 'rule-2',
        slug: 'ALL',
        attribute_key: 'ALL',
        attribute_value: 'ALL',
        min_items: 5,
      });
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(1); // Returns > 0 = true
      dataService.checkAssetOwnershipWithCriteria.mockResolvedValueOnce(0); // Returns 0 = false
      dbService.updateLastVerified.mockResolvedValue({});
      discordVerificationService.removeUserRole.mockResolvedValue(true);
      dbService.updateRoleAssignmentStatus.mockResolvedValue({});

      await service.reverifyUser('user1');

      // First call should be for specific collection and trait
      expect(dataService.checkAssetOwnershipWithCriteria).toHaveBeenNthCalledWith(
        1,
        '0x123',
        'test-collection',
        'trait',
        'rare',
        1
      );

      // Second call should be for any collection (slug: ALL, others ALL)
      expect(dataService.checkAssetOwnershipWithCriteria).toHaveBeenNthCalledWith(
        2,
        '0x123',
        'ALL',
        'ALL',
        'ALL',
        5
      );
    });
  });
});
