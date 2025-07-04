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
  addServerToUser: jest.fn(),
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
            roles: {
              add: jest.fn(),
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
      mockDbService.getServerRole.mockResolvedValue('role-id');
      mockNonceService.createNonce.mockResolvedValue('test-nonce');

      await service.requestVerification(mockInteraction as any);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
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

    it('should handle error when role not found', async () => {
      mockDbService.getServerRole.mockResolvedValue(null);
      mockDbService.findRuleByMessageId.mockResolvedValue(null);

      await service.requestVerification(mockInteraction as any);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'Error: Verification role not found for this message.'
      });
    });
  });

  describe('addUserRole', () => {
    it('should add role to user successfully', async () => {
      const nonce = 'test-nonce';
      service.tempMessages[nonce] = mockInteraction as any;

      await service.addUserRole('user-id', 'role-id', 'guild-id', 'wallet-address', nonce);

      expect(mockDbService.addServerToUser).toHaveBeenCalledWith(
        'user-id',
        'guild-id',
        'Test Role',
        'wallet-address'
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Successful'
            })
          })
        ])
      });
      expect(service.tempMessages[nonce]).toBeUndefined();
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
        ])
      });
      expect(service.tempMessages[nonce]).toBeUndefined();
    });

    it('should handle missing stored interaction gracefully', async () => {
      // Should not throw error
      await service.throwError('invalid-nonce', 'Test error');
    });
  });

  describe('getVerificationRoleId', () => {
    it('should return legacy role ID when available', async () => {
      mockDbService.getServerRole.mockResolvedValue('legacy-role-id');

      const result = await service.getVerificationRoleId('guild-id', 'channel-id', 'message-id');

      expect(result).toBe('legacy-role-id');
      expect(mockDbService.getServerRole).toHaveBeenCalledWith('guild-id');
    });

    it('should return new rule role ID when legacy not available', async () => {
      mockDbService.getServerRole.mockResolvedValue(null);
      mockDbService.findRuleByMessageId.mockResolvedValue({ role_id: 'new-role-id' });

      const result = await service.getVerificationRoleId('guild-id', 'channel-id', 'message-id');

      expect(result).toBe('new-role-id');
      expect(mockDbService.findRuleByMessageId).toHaveBeenCalledWith('guild-id', 'channel-id', 'message-id');
    });

    it('should return null when no role found', async () => {
      mockDbService.getServerRole.mockResolvedValue(null);
      mockDbService.findRuleByMessageId.mockResolvedValue(null);

      const result = await service.getVerificationRoleId('guild-id', 'channel-id', 'message-id');

      expect(result).toBeNull();
    });
  });
});
