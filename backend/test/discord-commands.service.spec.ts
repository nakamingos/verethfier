import { Test, TestingModule } from '@nestjs/testing';
import { DiscordCommandsService } from '../src/services/discord-commands.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DbService } from '../src/services/db.service';
import { MessageFlags, ChannelType } from 'discord.js';
import { Logger } from '@nestjs/common';

const mockDbService = {
  getLegacyRoles: jest.fn(),
  addRoleMapping: jest.fn(),
  deleteRoleMapping: jest.fn(),
  getRoleMappings: jest.fn(),
  ruleExists: jest.fn(),
  removeAllLegacyRoles: jest.fn(),
  getAllRulesWithLegacy: jest.fn(),
  updateRuleMessageId: jest.fn(),
  getRulesByChannel: jest.fn(),
  findConflictingRule: jest.fn(),
};

const mockDiscordMessageService = {
  findExistingVerificationMessage: jest.fn(),
  createVerificationMessage: jest.fn(),
  verifyMessageExists: jest.fn(),
};

describe('DiscordCommandsService', () => {
  let service: DiscordCommandsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordCommandsService,
        { provide: DbService, useValue: mockDbService },
        { provide: DiscordMessageService, useValue: mockDiscordMessageService },
      ],
    }).compile();

    service = module.get<DiscordCommandsService>(DiscordCommandsService);
    jest.clearAllMocks();
  });

  describe('handleAddRule', () => {
    it('should prevent adding rule when legacy roles exist', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id', channels: { cache: new Map() } },
        options: {
          getChannel: () => ({ id: 'channel-id', type: ChannelType.GuildText }),
          getRole: () => ({ id: 'role-id' }),
          getString: () => null,
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({
        data: [{ role_id: 'legacy-role' }]
      });

      await service.handleAddRule(mockInteraction);

      expect(mockDbService.getLegacyRoles).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining('migrate or remove the legacy rule'),
        flags: MessageFlags.Ephemeral
      });
    });

    it('should create new rule successfully', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role' };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) }
        },
        options: {
          getChannel: () => mockChannel,
          getRole: () => mockRole,
          getString: (key: string) => {
            if (key === 'slug') return 'test-collection';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null); // No conflicting rule
      mockDbService.addRoleMapping.mockResolvedValue([{ id: 1 }]); // Returns array with new rule
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'test-collection',
        'role-id',
        'Test Role',  // role_name
        null,
        null,
        1  // min_items now defaults to 1 instead of null
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Rule Added'
            })
          })
        ])
      });
    });

    it('should create rule with slug="ALL" when no criteria provided', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id', name: 'test-guild' },
        options: {
          getChannel: () => ({ id: 'channel-id', name: 'test-channel', type: 0 }),
          getRole: () => ({ id: 'role-id', name: 'Test Role' }),
          getString: jest.fn().mockReturnValue(null), // All criteria return null
          getInteger: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null); // No conflicting rule
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      // The DbService.addRoleMapping is called with null values from the command, 
      // but the DbService itself will convert them to defaults ('ALL', '', '', 1)
      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        null, // This will be converted to 'ALL' by DbService
        'role-id',
        'Test Role',  // role_name
        null,
        null,
        1  // min_items now defaults to 1 instead of null
      );
    });

    it('should handle duplicate rule error gracefully', async () => {
      // Clear all mocks to ensure clean state
      jest.clearAllMocks();
      
      // Mock Logger.error to suppress error output during test
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
      
      const mockInteraction = {
        guild: { id: 'guild-id', name: 'test-guild' },
        options: {
          getChannel: () => ({ id: 'channel-id', name: 'test-channel', type: 0 }),
          getRole: () => ({ id: 'role-id', name: 'test-role' }),
          getString: jest.fn().mockReturnValue('test-collection'),
          getInteger: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null); // No conflict found in pre-check
      // Simulate a duplicate constraint error from the database
      const dbError = new Error('duplicate key value violates unique constraint');
      (dbError as any).code = '23505';
      mockDbService.addRoleMapping.mockRejectedValue(dbError);

      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalled();
      const call = mockInteraction.editReply.mock.calls[0][0];
      expect(call.embeds).toBeDefined();
      expect(call.embeds.length).toBeGreaterThan(0);
      expect(call.embeds[0].data.title).toBe('Rule Already Exists');
      expect(call.embeds[0].data.description).toContain('A rule with the same criteria already exists');
      
      // Cleanup
      loggerErrorSpy.mockRestore();
    });
  });

  describe('handleRemoveRule', () => {
    it('should remove rule successfully', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id' },
        options: {
          getChannel: () => ({ id: 'channel-id', name: 'test-channel' }),
          getRole: () => ({ id: 'role-id', name: 'test-role' }),
          getInteger: () => 1, // rule_id
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.deleteRoleMapping.mockResolvedValue({ error: null });

      await service.handleRemoveRule(mockInteraction);

      expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Rule Removed'
            })
          })
        ])
      });
    });
  });

  describe('handleListRules', () => {
    it('should list rules with legacy warning', async () => {
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          channels: { cache: new Map([['channel-id', { name: 'test-channel' }]]) },
          roles: { cache: new Map([['role-id', { name: 'test-role' }]]) }
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      const mockRules = [
        {
          id: 1,
          channel_id: 'channel-id',
          role_id: 'role-id',
          collection: 'test-collection',
          legacy: true
        }
      ];
      mockDbService.getAllRulesWithLegacy.mockResolvedValue(mockRules);

      await service.handleListRules(mockInteraction);

      expect(mockDbService.getAllRulesWithLegacy).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Verification Rules',
              description: expect.stringContaining('[LEGACY] Rule'),
              color: 12844800
            })
          })
        ]
      });
    });
  });

  describe('handleRemoveLegacyRule', () => {
    it('should remove legacy rules successfully', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id' },
        options: {
          getChannel: () => ({ id: 'channel-id' }),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({
        data: [{ role_id: 'legacy-role' }]
      });
      mockDbService.removeAllLegacyRoles.mockResolvedValue({ removed: [{ role_id: 'legacy-role', name: 'test' }] });

      await service.handleRemoveLegacyRule(mockInteraction);

      expect(mockDbService.removeAllLegacyRoles).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Removed')
      });
    });
  });

  describe('handleMigrateLegacyRule', () => {
    it('should migrate legacy rules successfully', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel' };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) }
        },
        options: {
          getChannel: () => mockChannel,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      const legacyRoles = [{ role_id: 'legacy-role', name: 'test' }];
      mockDbService.getLegacyRoles.mockResolvedValue({ data: legacyRoles });
      mockDbService.ruleExists.mockResolvedValue(false);
      mockDbService.addRoleMapping.mockResolvedValue([{ id: 1 }]);
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});
      mockDbService.removeAllLegacyRoles.mockResolvedValue({ removed: [{ role_id: 'legacy-role', name: 'test' }] });

      await service.handleMigrateLegacyRule(mockInteraction);

      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'ALL',
        'legacy-role',
        'test', // role_name from legacy.name
        null,
        null,
        1
      );
      expect(mockDbService.removeAllLegacyRoles).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Migrated legacy rule')
      });
    });
  });

  describe('handleRecoverVerification', () => {
    it('should recover verification setup for orphaned rules', async () => {
      const mockChannel = {
        id: 'channel-id',
        type: 0, // ChannelType.GuildText
        toString: () => '<#channel-id>'
      };
      
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel)
        },
        guild: { id: 'guild-id' },
        deferReply: jest.fn(),
        editReply: jest.fn()
      };

      // Mock orphaned rules (rules with deleted messages)
      const orphanedRules = [
        { id: 1, message_id: 'deleted-message-1', role_id: 'role-1' },
        { id: 2, message_id: 'deleted-message-2', role_id: 'role-2' }
      ];

      mockDbService.getRulesByChannel.mockResolvedValue(orphanedRules);
      mockDiscordMessageService.verifyMessageExists.mockResolvedValue(false); // Both messages are deleted
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('new-message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue(undefined);

      await service.handleRecoverVerification(mockInteraction as any);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: expect.any(Number) });
      expect(mockDbService.getRulesByChannel).toHaveBeenCalledWith('guild-id', 'channel-id');
      expect(mockDiscordMessageService.verifyMessageExists).toHaveBeenCalledTimes(2);
      expect(mockDiscordMessageService.createVerificationMessage).toHaveBeenCalledWith(mockChannel);
      expect(mockDbService.updateRuleMessageId).toHaveBeenCalledTimes(2);
      expect(mockDbService.updateRuleMessageId).toHaveBeenCalledWith(1, 'new-message-id');
      expect(mockDbService.updateRuleMessageId).toHaveBeenCalledWith(2, 'new-message-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: 'Verification Recovery Complete'
          })
        })]
      });
    });

    it('should handle case when no orphaned rules exist', async () => {
      const mockChannel = {
        id: 'channel-id',
        type: 0, // ChannelType.GuildText
      };
      
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel)
        },
        guild: { id: 'guild-id' },
        deferReply: jest.fn(),
        editReply: jest.fn()
      };

      // Mock rules with existing messages
      const existingRules = [
        { id: 1, message_id: 'existing-message-1', role_id: 'role-1' }
      ];

      mockDbService.getRulesByChannel.mockResolvedValue(existingRules);
      mockDiscordMessageService.verifyMessageExists.mockResolvedValue(true); // Message exists

      await service.handleRecoverVerification(mockInteraction as any);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'No orphaned verification rules found for this channel. All existing verification messages appear to be intact.'
      });
      expect(mockDiscordMessageService.createVerificationMessage).not.toHaveBeenCalled();
    });
  });
});
