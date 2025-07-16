import { Test, TestingModule } from '@nestjs/testing';
import { DiscordVerificationService } from '../src/services/discord-verification.service';
import { DbService } from '../src/services/db.service';
import { NonceService } from '../src/services/nonce.service';
import { Logger } from '@nestjs/common';
import { MessageFlags } from 'discord.js';

// Mock Logger methods to suppress error output during tests
const loggerSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
const loggerDebugSpy = jest.spyOn(Logger, 'debug').mockImplementation(() => {});

const mockDbService = {
  getServerRole: jest.fn(),
  findRuleByMessageId: jest.fn(),
  getRulesByChannel: jest.fn(),
  addServerToUser: jest.fn(),
  trackRoleAssignment: jest.fn(),
};

const mockNonceService = {
  createNonce: jest.fn(),
};

const mockClient = {
  guilds: {
    cache: new Map([
      ['guild-id', {
        id: 'guild-id',
        name: 'Test Guild',
        members: {
          fetch: jest.fn().mockResolvedValue({
            id: 'user-id',
            displayName: 'Test User',
            user: {
              username: 'testuser',
              id: 'user-id'
            },
            roles: {
              add: jest.fn(),
              cache: {
                has: jest.fn().mockReturnValue(false), // User doesn't have the role by default
              }
            },
          }),
        },
        roles: {
          cache: {
            get: jest.fn().mockReturnValue({ id: 'role-id', name: 'Test Role' }),
            map: jest.fn().mockReturnValue([{ id: 'role-id', name: 'Test Role' }])
          }
        }
      }]
    ])
  },
  get: jest.fn().mockImplementation((id) => {
    return mockClient.guilds.cache.get(id);
  })
};

const mockInteraction = {
  guild: { 
    id: 'guild-id', 
    name: 'Test Guild', 
    iconURL: jest.fn().mockReturnValue('https://example.com/icon.png'),
    roles: { cache: new Map([['role-id', { id: 'role-id', name: 'Test Role' }]]) } 
  },
  channel: { id: 'channel-id' },
  message: { id: 'message-id' },
  user: { id: 'user-id', tag: 'testuser#1234', avatarURL: () => 'avatar-url' },
  deferReply: jest.fn(),
  editReply: jest.fn(),
  reply: jest.fn(),
  isRepliable: jest.fn().mockReturnValue(true),
  deferred: true,
};

describe('DiscordVerificationService', () => {
  let service: DiscordVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordVerificationService,
        { provide: DbService, useValue: mockDbService },
        { provide: NonceService, useValue: mockNonceService },
      ],
    }).compile();

    service = module.get<DiscordVerificationService>(DiscordVerificationService);
    service.initialize(mockClient as any);
    jest.clearAllMocks();
    loggerSpy.mockClear();
    loggerDebugSpy.mockClear();
  });

  afterAll(() => {
    loggerSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  describe('requestVerification', () => {
    it('should create verification request successfully', async () => {
      mockDbService.getRulesByChannel.mockResolvedValue([{ role_id: 'role-id' }]);
      mockNonceService.createNonce.mockResolvedValue('test-nonce');

      await service.requestVerification(mockInteraction as any);

      // Note: deferReply is now handled by the caller, not by requestVerification
      expect(mockDbService.getRulesByChannel).toHaveBeenCalledWith('guild-id', 'channel-id');
      expect(mockNonceService.createNonce).toHaveBeenCalledWith(
        'user-id',
        'message-id',
        'channel-id'
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Wallet Verification'
            })
          })
        ]),
        components: expect.any(Array)
      });
    });

    it('should handle error when no rules found', async () => {
      mockDbService.getRulesByChannel.mockResolvedValue([]);

      await service.requestVerification(mockInteraction as any);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Error: No verification rules found for this channel.'
      });
    });
  });

  describe('addUserRole', () => {
    it('should add role to user successfully', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      await service.addUserRole('user-id', 'role-id', 'guild-id', nonce, 'rule-123');

      expect(mockDbService.trackRoleAssignment).toHaveBeenCalledWith({
        userId: 'user-id',
        serverId: 'guild-id',
        roleId: 'role-id',
        ruleId: 'rule-123',
        userName: 'Test User',
        serverName: 'Test Guild',
        roleName: 'Test Role',
        expiresInHours: undefined
      });
      // addUserRole no longer sends success message or cleans up nonce
      expect(mockInteraction.editReply).not.toHaveBeenCalled();
      expect(service.tempMessages[nonce]).toBeDefined(); // Should still exist
    });

    it('should handle error when guild not found', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      await expect(
        service.addUserRole('user-id', 'role-id', 'invalid-guild', 'wallet-address', nonce)
      ).rejects.toThrow('Guild not found');
    });

    it('should handle error when no stored interaction', async () => {
      await expect(
        service.addUserRole('user-id', 'role-id', 'guild-id', 'wallet-address', 'invalid-nonce')
      ).rejects.toThrow('No stored interaction found for this nonce');
    });
  });

  describe('throwError', () => {
    it('should send error message to user', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      await service.throwError(nonce, 'Test error message');

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Failed',
              description: 'Test error message'
            })
          })
        ]),
        components: [] // Expect components to be cleared
      });
      expect(service.tempMessages[nonce]).toBeUndefined();
    });

    it('should remove verify button when sending error message', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      await service.throwError(nonce, 'Test error message');

      // Verify that components array is empty (no "Verify Now" button)
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editReplyCall.components).toEqual([]);
    });

    it('should handle missing stored interaction gracefully', async () => {
      // Should not throw error
      await service.throwError('invalid-nonce', 'Test error');
    });
  });

  describe('sendVerificationComplete', () => {
    it('should send verification complete message with role names', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      const roleResults = [
        { roleId: 'role-id', roleName: 'Test Role', wasAlreadyAssigned: false }
      ];

      await service.sendVerificationComplete('guild-id', nonce, roleResults);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Successful',
              description: expect.stringContaining('Test Role')
            })
          })
        ]),
        components: [] // Expect components to be cleared
      });
      expect(service.tempMessages[nonce]).toBeUndefined(); // Should be cleaned up
    });

    it('should handle multiple roles', async () => {
      const nonce = 'test-nonce';
      const mockRole = { id: 'role-id', name: 'Test Role' };
      const mockRole2 = { id: 'role-id-2', name: 'Test Role 2' };
      // Add the second role to the mock cache
      mockClient.guilds.cache.get('guild-id').roles.cache.get.mockImplementation((roleId: string) => {
        if (roleId === 'role-id') return mockRole;
        if (roleId === 'role-id-2') return mockRole2;
        return undefined;
      });
      service.tempMessages[nonce] = mockInteraction as any;

      const roleResults = [
        { roleId: 'role-id', roleName: 'Test Role', wasAlreadyAssigned: false },
        { roleId: 'role-id-2', roleName: 'Test Role 2', wasAlreadyAssigned: true }
      ];

      await service.sendVerificationComplete('guild-id', nonce, roleResults);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Successful',
              description: expect.stringMatching(/Test Role[\s\S]*Test Role 2/)
            })
          })
        ]),
        components: [] // Expect components to be cleared
      });
    });

    it('should deduplicate duplicate role IDs in the roles list', async () => {
      const nonce = 'test-nonce';
      const mockRole = { id: 'role-id', name: 'GIF Goddess' };
      // Mock the role cache
      mockClient.guilds.cache.get('guild-id').roles.cache.get.mockImplementation((roleId: string) => {
        if (roleId === 'role-id') return mockRole;
        return undefined;
      });
      service.tempMessages[nonce] = mockInteraction as any;

      // Pass duplicate role IDs (same role assigned by multiple rules)
      const roleResults = [
        { roleId: 'role-id', roleName: 'GIF Goddess', wasAlreadyAssigned: false },
        { roleId: 'role-id', roleName: 'GIF Goddess', wasAlreadyAssigned: false },
        { roleId: 'role-id', roleName: 'GIF Goddess', wasAlreadyAssigned: false }
      ];

      await service.sendVerificationComplete('guild-id', nonce, roleResults);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Successful',
              description: expect.stringContaining('• GIF Goddess')
            })
          })
        ]),
        components: [] // Expect components to be cleared
      });
      
      // Verify that 'GIF Goddess' appears only once in the description
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      const description = editReplyCall.embeds[0].data.description;
      const matches = description.match(/• GIF Goddess/g);
      expect(matches).toHaveLength(1); // Should appear only once, not three times
    });

    it('should remove verify button when sending success message', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      const roleResults = [
        { roleId: 'role-id', roleName: 'Test Role', wasAlreadyAssigned: false }
      ];

      await service.sendVerificationComplete('guild-id', nonce, roleResults);

      // Verify that components array is empty (no "Verify Now" button)
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editReplyCall.components).toEqual([]);
    });

    it('should handle error when guild not found', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      const roleResults = [
        { roleId: 'role-id', roleName: 'Test Role', wasAlreadyAssigned: false }
      ];

      await expect(
        service.sendVerificationComplete('invalid-guild', nonce, roleResults)
      ).rejects.toThrow('Guild not found');
    });
  });
});
