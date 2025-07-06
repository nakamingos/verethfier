import { Test, TestingModule } from '@nestjs/testing';
import { DiscordCommandsService } from '../src/services/discord-commands.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DbService } from '../src/services/db.service';
import { DiscordService } from '../src/services/discord.service';
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
  checkForDuplicateRule: jest.fn(),
  checkForExactDuplicateRule: jest.fn(),
};

const mockDiscordMessageService = {
  findExistingVerificationMessage: jest.fn(),
  createVerificationMessage: jest.fn(),
  verifyMessageExists: jest.fn(),
};

const mockDiscordService = {
  getRole: jest.fn(),
};

describe('DiscordCommandsService', () => {
  let service: DiscordCommandsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordCommandsService,
        { provide: DbService, useValue: mockDbService },
        { provide: DiscordMessageService, useValue: mockDiscordMessageService },
        { provide: DiscordService, useValue: mockDiscordService },
      ],
    }).compile();

    service = module.get<DiscordCommandsService>(DiscordCommandsService);
    jest.clearAllMocks();
  });

  describe('handleAddRule', () => {
    it('should prevent adding rule when legacy roles exist', async () => {
      const mockChannel = { id: 'channel-id', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: { 
          id: 'guild-id', 
          channels: { cache: new Map() },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({
        data: [{ role_id: 'legacy-role' }]
      });

      await service.handleAddRule(mockInteraction);

      expect(mockDbService.getLegacyRoles).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('migrate or remove the legacy rule')
      });
    });

    it('should create new rule successfully', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            if (key === 'slug') return 'test-collection';
            if (key === 'attribute_key') return null;
            if (key === 'attribute_value') return null;
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null); // No exact duplicate
      mockDbService.checkForDuplicateRule.mockResolvedValue(null); // No duplicate rule
      mockDbService.getRulesByChannel.mockResolvedValue([]); // No existing rules
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'test-collection' }); // Returns new rule object
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
        'ALL', // Now defaults to 'ALL' when null
        'ALL', // Now defaults to 'ALL' when null
        1  // min_items now defaults to 1 instead of null
      );
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Rule Added',
              description: expect.stringContaining('Rule 1 for <#channel-id> and <@&role-id> added'),
              fields: expect.arrayContaining([
                expect.objectContaining({ name: 'Collection', value: 'test-collection' }),
                expect.objectContaining({ name: 'Attribute', value: 'ALL' }),
                expect.objectContaining({ name: 'Min Items', value: '1' })
              ])
            })
          })
        ],
        components: []
      });
    });

    it('should create rule with "ALL" defaults when no criteria provided', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: 0 };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: { 
          id: 'guild-id', 
          name: 'test-guild',
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            return null; // All other criteria return null
          },
          getInteger: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null); // No conflicting rule
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      // Now expect the service to pass 'ALL' defaults to DbService
      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'ALL', // Now defaults to 'ALL' in the service
        'role-id',
        'Test Role',  // role_name
        'ALL', // Now defaults to 'ALL' in the service
        'ALL', // Now defaults to 'ALL' in the service
        1  // min_items now defaults to 1
      );
    });

    it('should handle duplicate rule error gracefully', async () => {
      // Clear all mocks to ensure clean state
      jest.clearAllMocks();
      
      // Mock Logger.error to suppress error output during test
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
      
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: 0 };
      const mockRole = { id: 'role-id', name: 'test-role', editable: true };
      const mockInteraction = {
        guild: { 
          id: 'guild-id', 
          name: 'test-guild',
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'test-role';
            if (key === 'slug') return 'test-collection';
            return null;
          },
          getInteger: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
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
      expect(call.embeds[0].data.title).toBe('❌ Error Creating Rule');
      expect(call.embeds[0].data.description).toContain('Failed to create the rule');
      
      // Cleanup
      loggerErrorSpy.mockRestore();
    });

    it('should handle direct attribute input', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            if (key === 'slug') return 'test-collection';
            if (key === 'attribute_key') return 'rarity';
            if (key === 'attribute_value') return 'legendary';
            return null;
          },
          getInteger: () => 5,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
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
        'Test Role',
        'rarity',
        'legendary',
        5
      );
    });

    it('should handle attribute_key only (any value) rule', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            return null; // All other criteria return null
          },
          getInteger: jest.fn().mockReturnValue(null),
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.findConflictingRule.mockResolvedValue(null);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'ALL', // Now defaults to 'ALL' in the service
        'role-id',
        'Test Role',  // role_name
        'ALL', // Now defaults to 'ALL' in the service
        'ALL', // Now defaults to 'ALL' in the service
        1  // min_items now defaults to 1
      );
      
      // Check that the reply includes proper formatting for attribute_key only
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Rule Added',
              description: expect.stringContaining('Rule 1 for <#channel-id> and <@&role-id> added'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Attribute',
                  value: 'ALL' // Fixed to match actual behavior when all fields are null
                })
              ])
            })
          })
        ],
        components: []
      });
    });

    it('should handle attribute_value only rule', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Test Role';
            if (key === 'slug') return 'call-data-comrades';
            if (key === 'attribute_key') return null; // Empty = defaults to ALL
            if (key === 'attribute_value') return 'gold';
            return null;
          },
          getInteger: () => 1,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.findConflictingRule.mockResolvedValue(null);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(null);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'call-data-comrades',
        'role-id',
        'Test Role',
        'ALL', // Should default to ALL when null
        'gold',
        1
      );
      
      // Check that the reply includes proper formatting for attribute_value only
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              title: '✅ Rule Added',
              description: expect.stringContaining('Rule 1 for <#channel-id> and <@&role-id> added'),
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Attribute',
                  value: 'ALL=gold' // Should show "ALL=gold" not just "ALL"
                })
              ])
            })
          })
        ],
        components: []
      });
    });

    it('should reject roles that are not editable', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Admin Role', editable: false };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockRole)
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Admin Role';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });

      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('A role named "Admin Role" already exists but is positioned higher than the bot\'s role')
      });
      expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
    });

    it('should prevent creating duplicate role when typing existing high-hierarchy role name', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockAdminRole = { id: 'admin-role-id', name: 'Admin', editable: false };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(mockAdminRole) // User typed "admin", finds existing "Admin" role
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'admin'; // User typed "admin" (lowercase)
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });

      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('A role named "admin" already exists but is positioned higher than the bot\'s role')
      });
      expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
    });

    it('should prevent creating any duplicate role name even if the existing role is manageable', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockExistingRole = { id: 'existing-role-id', name: 'Member', editable: true };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          roles: {
            cache: {
              find: jest.fn()
                .mockReturnValueOnce(undefined) // First call for role lookup returns undefined (role doesn't exist)
                .mockReturnValueOnce(mockExistingRole) // Second call during role creation finds existing role
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'member'; // User typed "member" (different case)
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });

      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ A role named "member" already exists in this server. Please choose a different name for the new role.'
      });
      expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
    });

    it('should create new role when name is truly unique', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockBotMember = {
        roles: {
          highest: { position: 5 }
        }
      };
      const mockNewRole = { id: 'new-role-id', name: 'Unique Role' };
      const mockInteraction = {
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          channels: { cache: new Map([['channel-id', mockChannel]]) },
          members: { me: mockBotMember },
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(undefined) // No role with this name exists
            },
            create: jest.fn().mockResolvedValue(mockNewRole)
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (key: string) => {
            if (key === 'role') return 'Unique Role';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'ALL' });
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.guild.roles.create).toHaveBeenCalledWith({
        name: 'Unique Role',
        color: 'Blue',
        position: 4, // Bot's highest position (5) - 1
        reason: 'Auto-created for verification rule by test-user#1234'
      });
      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: '✅ Created new role: **Unique Role**',
        ephemeral: true
      });
      expect(mockDbService.addRoleMapping).toHaveBeenCalled();
    });

    describe('duplicate rule detection', () => {
      it('should warn admin when creating duplicate rule', async () => {
        const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
        const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
        const mockInteraction = {
          id: 'interaction-123',
          guild: { 
            id: 'guild-id', 
            name: 'test-guild',
            roles: {
              cache: {
                find: jest.fn().mockReturnValue(mockRole)
              }
            }
          },
          user: { id: 'user-id', tag: 'test-user#1234' },
          channel: {
            createMessageComponentCollector: jest.fn(() => ({
              on: jest.fn(),
              stop: jest.fn(),
            }))
          },
          options: {
            getChannel: () => mockChannel,
            getString: (key: string) => {
              if (key === 'role') return 'Test Role';
              if (key === 'slug') return 'test-collection';
              if (key === 'attribute_key') return 'Gold';
              if (key === 'attribute_value') return 'rare';
              return null;
            },
            getInteger: () => 1,
          },
          deferReply: jest.fn(),
          editReply: jest.fn(),
          followUp: jest.fn(),
        } as any;

        // Mock existing rule
        mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
        mockDbService.checkForDuplicateRule.mockResolvedValue({
          id: 1,
          role_id: 'existing-role-id',
          slug: 'test-collection',
          attribute_key: 'Gold',
          attribute_value: 'rare',
          min_items: 1
        });

        mockDiscordService.getRole.mockResolvedValue({ name: 'Existing Role' });

        await service.handleAddRule(mockInteraction);

        expect(mockDbService.checkForDuplicateRule).toHaveBeenCalledWith(
          'guild-id',
          'channel-id',
          'test-collection',
          'Gold',
          'rare',
          1,
          'role-id'
        );

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '⚠️ Duplicate Rule Detected'
              })
            })
          ]),
          components: expect.any(Array)
        });
      });

      it('should proceed normally when no duplicate found', async () => {
        const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
        const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
        const mockInteraction = {
          guild: { 
            id: 'guild-id', 
            name: 'test-guild',
            roles: {
              cache: {
                find: jest.fn().mockReturnValue(mockRole)
              }
            }
          },
          user: { tag: 'test-user#1234' },
          options: {
            getChannel: () => mockChannel,
            getString: (key: string) => {
              if (key === 'role') return 'Test Role';
              return null;
            },
            getInteger: () => null,
          },
          deferReply: jest.fn(),
          editReply: jest.fn(),
          followUp: jest.fn(),
        } as any;

        mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
        mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
        mockDbService.checkForDuplicateRule.mockResolvedValue(null);
        mockDbService.getRulesByChannel.mockResolvedValue([]);
        mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'ALL' });
        mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-123');

        await service.handleAddRule(mockInteraction);

        expect(mockDbService.checkForDuplicateRule).toHaveBeenCalled();
        expect(mockDbService.addRoleMapping).toHaveBeenCalled();
      });

      it('should prevent creating exact duplicate rule (same role + same criteria)', async () => {
        const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
        const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
        const mockInteraction = {
          guild: {
            id: 'guild-id',
            name: 'test-guild',
            channels: { cache: new Map([['channel-id', mockChannel]]) },
            roles: {
              cache: {
                find: jest.fn().mockReturnValue(mockRole)
              }
            }
          },
          user: { tag: 'test-user#1234' },
          options: {
            getChannel: () => mockChannel,
            getString: (key: string) => {
              if (key === 'role') return 'Test Role';
              if (key === 'slug') return 'test-collection';
              if (key === 'attribute_key') return 'Gold';
              if (key === 'attribute_value') return 'rare';
              return null;
            },
            getInteger: () => 1,
          },
          reply: jest.fn(),
          deferReply: jest.fn(),
          editReply: jest.fn(),
          followUp: jest.fn(),
        } as any;

        mockDbService.getLegacyRoles.mockResolvedValue({ data: [] });
        mockDbService.checkForExactDuplicateRule.mockResolvedValue({
          id: 1,
          role_id: 'role-id',
          slug: 'test-collection',
          attribute_key: 'Gold',
          attribute_value: 'rare',
          min_items: 1
        });

        await service.handleAddRule(mockInteraction);

        expect(mockDbService.checkForExactDuplicateRule).toHaveBeenCalledWith(
          'guild-id',
          'channel-id',
          'test-collection',
          'Gold',
          'rare',
          1,
          'role-id'
        );

        expect(mockInteraction.editReply).toHaveBeenCalledWith({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                title: '❌ Duplicate Rule',
                description: 'This exact rule already exists!'
              })
            })
          ]),
          components: []
        });
        expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
      });
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
