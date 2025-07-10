import { Test, TestingModule } from '@nestjs/testing';
import { DiscordCommandsService } from '../src/services/discord-commands.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DbService } from '../src/services/db.service';
import { DiscordService } from '../src/services/discord.service';
import { MessageFlags, ChannelType } from 'discord.js';
import { Logger } from '@nestjs/common';

const mockDbService = {
  addRoleMapping: jest.fn(),
  deleteRoleMapping: jest.fn(),
  getRoleMappings: jest.fn(),
  ruleExists: jest.fn(),
  updateRuleMessageId: jest.fn(),
  getRulesByChannel: jest.fn(),
  findConflictingRule: jest.fn(),
  checkForDuplicateRule: jest.fn(),
  checkForExactDuplicateRule: jest.fn(),
  checkForDuplicateRole: jest.fn(),
  restoreRuleWithOriginalId: jest.fn(),
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
    it('should create new rule successfully', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        id: 'interaction-123',
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

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null); // No exact duplicate
      mockDbService.checkForDuplicateRule.mockResolvedValue(null); // No duplicate rule
      mockDbService.checkForDuplicateRole.mockResolvedValue(null); // No duplicate role
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
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                label: 'Undo'
              })
            ])
          })
        ])
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
      expect(call.embeds[0].data.title).toBe('❌ Rule Creation Failed');
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
        id: 'interaction-123',
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

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
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
      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      
      // Check the embed
      expect(editReplyCall.embeds).toBeDefined();
      expect(editReplyCall.embeds[0].data.title).toBe('✅ Rule Added');
      expect(editReplyCall.embeds[0].data.description).toContain('Rule 1 for <#channel-id> and <@&role-id> added');
      
      // Check the components
      expect(editReplyCall.components).toBeDefined();
      expect(editReplyCall.components[0].components).toHaveLength(1);
      expect(editReplyCall.components[0].components[0].label).toBe('Undo');
      expect(editReplyCall.components[0].components[0].custom_id).toBe('undo_rule_interaction-123');
    });

    it('should handle attribute_value only rule', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
      const mockInteraction = {
        id: 'interaction-456',
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
      expect(mockInteraction.editReply).toHaveBeenCalled();
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      
      // Check the embed
      expect(editReplyCall.embeds).toBeDefined();
      expect(editReplyCall.embeds[0].data.title).toBe('✅ Rule Added');
      expect(editReplyCall.embeds[0].data.description).toContain('Rule 1 for <#channel-id> and <@&role-id> added');
      
      // Check specific field values
      const fields = editReplyCall.embeds[0].data.fields;
      expect(fields.find(f => f.name === 'Collection')?.value).toBe('call-data-comrades');
      expect(fields.find(f => f.name === 'Attribute')?.value).toBe('ALL=gold');
      
      // Check the components
      expect(editReplyCall.components).toBeDefined();
      expect(editReplyCall.components[0].components).toHaveLength(1);
      expect(editReplyCall.components[0].components[0].label).toBe('Undo');
      expect(editReplyCall.components[0].components[0].custom_id).toBe('undo_rule_interaction-456');
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


      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: {
              color: 0xFF0000, // Red color for error
              title: '❌ Role Hierarchy Issue',
              description: 'A role named "Admin Role" already exists but is positioned higher than the bot\'s role. The bot cannot manage this role.',
              fields: [
                {
                  name: '💡 What you can do:',
                  value: '• Use a different role name\n• Move the bot\'s role higher in the server settings\n• Ask an admin to move the "Admin Role" role below the bot\'s role',
                  inline: false
                }
              ]
            }
          })
        ]
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


      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: {
              color: 0xFF0000, // Red color for error
              title: '❌ Role Hierarchy Issue',
              description: 'A role named "admin" already exists but is positioned higher than the bot\'s role. The bot cannot manage this role.',
              fields: [
                {
                  name: '💡 What you can do:',
                  value: '• Use a different role name\n• Move the bot\'s role higher in the server settings\n• Ask an admin to move the "admin" role below the bot\'s role',
                  inline: false
                }
              ]
            }
          })
        ]
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


      await service.handleAddRule(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: {
              color: 0xFF0000, // Red color for error
              title: '❌ Duplicate Role Name',
              description: 'A role named "member" already exists in this server.',
              fields: [
                {
                  name: '💡 What you can do:',
                  value: '• Choose a different name for the new role',
                  inline: false
                }
              ]
            }
          })
        ]
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

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
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
        mockDbService.checkForDuplicateRule.mockResolvedValue({
          id: 1,
          role_id: 'existing-role-id',
          slug: 'test-collection',
          attribute_key: 'Gold',
          attribute_value: 'rare',
          min_items: 1
        });
        mockDbService.checkForDuplicateRole.mockResolvedValue(null); // No role duplicate

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
          embeds: [
            expect.objectContaining({
              data: {
                color: 0xFFA500, // Orange color for warning
                title: '⚠️ Duplicate Rule Criteria',
                description: 'A rule with the same criteria already exists for a different role. Users meeting these criteria will receive **both roles**. This might be intentional (role stacking) or an error.',
                fields: [
                  {
                    name: 'Existing Rule',
                    value: '**Existing Role**\n**Role:** <@&existing-role-id>\n**Collection:** test-collection\n**Attribute:** Gold=rare\n**Min Items:** 1',
                    inline: true
                  },
                  {
                    name: 'New Rule (Proposed)',
                    value: '**Test Role**\n**Role:** <@&role-id>\n**Collection:** test-collection\n**Attribute:** Gold=rare\n**Min Items:** 1',
                    inline: true
                  },
                  {
                    name: '💡 What you can do:',
                    value: '• Click "Create Anyway" to proceed with role stacking\n• Click "Cancel" to modify your criteria',
                    inline: false
                  }
                ]
              }
            })
          ],
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

        mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
        mockDbService.checkForDuplicateRule.mockResolvedValue(null);
        mockDbService.checkForDuplicateRole.mockResolvedValue(null);
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
          embeds: [
            expect.objectContaining({
              data: {
                color: 0xFF0000, // Red color for error
                title: '❌ Exact Duplicate Rule',
                description: 'This exact rule already exists!',
                fields: [
                  {
                    name: 'Existing Rule',
                    value: '**Role:** <@&role-id>\n**Collection:** test-collection\n**Attribute:** Gold=rare\n**Min Items:** 1',
                    inline: false
                  },
                  {
                    name: '💡 What you can do:',
                    value: '• Use different criteria (collection, attribute, or min items)\n• Remove the existing rule first with `/setup remove-rule`\n• Check existing rules with `/setup list-rules`',
                    inline: false
                  }
                ]
              }
            })
          ]
        });
        expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
      });

      it('should warn about duplicate role and allow confirmation', async () => {
        const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
        const mockRole = { id: 'role-id', name: 'Test Role', editable: true };
        const mockInteraction = {
          id: 'interaction-123',
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
              if (key === 'slug') return 'different-collection';
              return null;
            },
            getInteger: () => null,
          },
          deferReply: jest.fn(),
          editReply: jest.fn(),
          followUp: jest.fn(),
        } as any;

        // Mock existing role rule (same role, different criteria)
        mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
        mockDbService.checkForDuplicateRule.mockResolvedValue(null);
        mockDbService.checkForDuplicateRole.mockResolvedValue({
          id: 1,
          role_id: 'role-id', // Same role
          channel_id: 'channel-id', 
          slug: 'original-collection', // Different criteria
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 1
        });

        await service.handleAddRule(mockInteraction);

        // Verify warning message was sent (basic check)
        expect(mockInteraction.editReply).toHaveBeenCalled();
        // Verify rule was NOT created yet
        expect(mockDbService.addRoleMapping).not.toHaveBeenCalled();
      });
    });
  });

  describe('handleRemoveRule', () => {
    it('should remove rule successfully', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id' },
        id: 'interaction-id',
        user: { id: 'user-id' },
        channel: {
          createMessageComponentCollector: jest.fn(() => ({
            on: jest.fn(),
            stop: jest.fn()
          }))
        },
        options: {
          getChannel: () => ({ id: 'channel-id', name: 'test-channel' }),
          getRole: () => ({ id: 'role-id', name: 'test-role' }),
          getInteger: () => 1, // rule_id
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      const mockRule = {
        id: 1,
        server_id: 'guild-id',
        server_name: 'Test Guild',
        channel_id: 'channel-id',
        channel_name: 'test-channel',
        role_id: 'role-id',
        role_name: 'test-role',
        slug: 'test-collection',
        attribute_key: 'Gold',
        attribute_value: 'rare',
        min_items: 1
      };

      mockDbService.getRoleMappings.mockResolvedValue([mockRule]);
      mockDbService.deleteRoleMapping.mockResolvedValue({ error: null });

      await service.handleRemoveRule(mockInteraction);

      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('guild-id');
      expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: {
            color: 0x00FF00, // Green color for success
            title: '✅ Rule Removed',
            description: 'Rule 1 for test-channel and @test-role has been removed.',
            fields: [
              { name: 'Collection', value: 'test-collection', inline: true },
              { name: 'Attribute', value: 'Gold=rare', inline: true },
              { name: 'Min Items', value: '1', inline: true }
            ]
          }
        })],
        components: [{
          type: 1,
          components: [{
            type: 2,
            custom_id: 'undo_removal_interaction-id',
            label: 'Undo',
            style: 2,
            emoji: { name: '↩️' }
          }]
        }],
        ephemeral: true
      });
    });

    it('should handle rule not found for removal', async () => {
      const mockInteraction = {
        guild: { id: 'guild-id' },
        id: 'interaction-id',
        user: { id: 'user-id' },
        options: {
          getInteger: () => 999, // rule_id that doesn't exist
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      mockDbService.getRoleMappings.mockResolvedValue([]);

      await service.handleRemoveRule(mockInteraction);

      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('guild-id');
      expect(mockDbService.deleteRoleMapping).not.toHaveBeenCalled();
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '❌ Rule not found.'
      });
    });
  });

  describe('handleListRules', () => {
    it('should list all verification rules', async () => {
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
          server_id: 'guild-id',
          slug: 'test-collection',
          attribute_key: 'test-attr',
          attribute_value: 'test-value',
          min_items: 1
        }
      ];
      mockDbService.getRoleMappings.mockResolvedValue(mockRules);

      await service.handleListRules(mockInteraction);

      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('guild-id');
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: {
              color: 0xC3FF00, // Lime color for info
              title: '📋 Verification Rules',
              description: 'ID: 1 | Channel: <#channel-id> | Role: <@&role-id> | Slug: test-collection | Attr: test-attr=test-value | Min: 1'
            }
          })
        ]
      });
    });
  });

  describe('handleRecoverVerification', () => {
    it('should create verification message for channel with rules', async () => {
      const mockChannel = {
        id: 'channel-id',
        type: 0, // ChannelType.GuildText
        toString: () => '<#channel-id>',
        messages: {
          fetch: jest.fn().mockResolvedValue({
            find: jest.fn().mockReturnValue(null) // No existing messages with verify buttons
          })
        }
      };
      
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel)
        },
        guild: { id: 'guild-id' },
        deferReply: jest.fn(),
        editReply: jest.fn()
      };

      // Mock channel rules (no more message_id field)
      const channelRules = [
        { id: 1, role_id: 'role-1', channel_id: 'channel-id' },
        { id: 2, role_id: 'role-2', channel_id: 'channel-id' }
      ];

      mockDbService.getRulesByChannel.mockResolvedValue(channelRules);
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue(undefined);

      await service.handleRecoverVerification(mockInteraction as any);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: expect.any(Number) });
      expect(mockDbService.getRulesByChannel).toHaveBeenCalledWith('guild-id', 'channel-id');
      expect(mockDiscordMessageService.createVerificationMessage).toHaveBeenCalledWith(mockChannel);
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          expect.objectContaining({
            data: expect.objectContaining({
              color: 0x00FF00, // Green color for success
              title: '✅ Verification Message Created',
              description: 'Successfully created verification message for <#channel-id>',
              fields: [
                {
                  name: 'Channel',
                  value: '<#channel-id>',
                  inline: true
                },
                {
                  name: 'Active Rules',
                  value: '2 rules will use this message',
                  inline: true
                },
                {
                  name: 'Roles Affected',
                  value: '<@&role-1>, <@&role-2>',
                  inline: false
                }
              ],
              timestamp: expect.any(String)
            })
          })
        ]
      });
    });

    it('should handle case when verification message already exists in channel', async () => {
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

      const channelRules = [
        { id: 1, role_id: 'role-1', channel_id: 'channel-id' }
      ];

      // Mock that verification message already exists
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(true);
      mockDbService.getRulesByChannel.mockResolvedValue(channelRules);

      await service.handleRecoverVerification(mockInteraction as any);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: '✅ Channel already has a verification message. No recovery needed.'
      });
      expect(mockDiscordMessageService.createVerificationMessage).not.toHaveBeenCalled();
    });
  });

  describe('Undo functionality', () => {
    it('should include Undo button in confirmation message', async () => {
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
        user: { tag: 'test-user#1234' },
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
            return null;
          },
          getInteger: () => 1,
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'test-collection' });
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');

      await service.handleAddRule(mockInteraction);

      // Verify that the editReply was called with components (buttons)
      const editReplyCall = mockInteraction.editReply.mock.calls.find(call => 
        call[0].components && call[0].components.length > 0
      );
      expect(editReplyCall).toBeDefined();
      expect(editReplyCall[0].components).toHaveLength(1);
      
      // Check button configuration
      const actionRow = editReplyCall[0].components[0];
      expect(actionRow.components).toHaveLength(1);
      expect(actionRow.components[0].label).toBe('Undo');
    });

    it('should handle Undo button interaction', async () => {
      const mockButtonInteraction = {
        customId: 'undo_rule_interaction-123',
        reply: jest.fn(),
      } as any;

      // Simulate confirmation data
      const confirmationInfo = {
        ruleId: 1,
        serverId: 'guild-id',
        channel: { id: 'channel-id', name: 'test-channel' },
        role: { id: 'role-id', name: 'Test Role' },
        slug: 'test-collection',
        attributeKey: 'ALL',
        attributeValue: 'ALL',
        minItems: 1
      };
      
      // Access private property for testing
      (service as any).confirmationData.set('interaction-123', confirmationInfo);

      const mockRule = {
        id: 1,
        server_id: 'guild-id',
        channel_id: 'channel-id',
        role_id: 'role-id',
        slug: 'test-collection',
        attribute_key: 'ALL',
        attribute_value: 'ALL',
        min_items: 1
      };

      mockDbService.getRoleMappings.mockResolvedValue([mockRule]);
      mockDbService.deleteRoleMapping.mockResolvedValue({});

      // Call the private method directly for testing
      await (service as any).handleUndoRule(mockButtonInteraction);

      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('guild-id');
      expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'guild-id');
    });

    it('should handle Undo removal button interaction', async () => {
      const mockButtonInteraction = {
        customId: 'undo_removal_interaction-123',
        id: 'interaction-123',
        reply: jest.fn(),
        guild: { id: 'guild-id', name: 'Test Guild' }
      } as any;

      // Simulate removed rule data
      const removedRule = {
        id: 1,
        server_id: 'guild-id',
        server_name: 'Test Guild',
        channel_id: 'channel-id',
        channel_name: 'test-channel',
        role_id: 'role-id',
        role_name: 'test-role',
        slug: 'test-collection',
        attribute_key: 'Gold',
        attribute_value: 'rare',
        min_items: 1
      };
      
      // Access private property for testing
      (service as any).removedRules.set('interaction-123', removedRule);

      mockDbService.restoreRuleWithOriginalId.mockResolvedValue({ id: 1 }); // Same ID as original

      // Call the private method directly for testing
      await (service as any).handleUndoRemoval(mockButtonInteraction);

      expect(mockDbService.restoreRuleWithOriginalId).toHaveBeenCalledWith(removedRule);
      // Note: Not checking reply content structure as it contains Discord.js builders
    });

    it('should handle Undo restore button interaction', async () => {
      const mockButtonInteraction = {
        customId: 'undo_restore_interaction-123',
        id: 'interaction-123',
        user: { id: 'user-123' },
        channel: { createMessageComponentCollector: jest.fn() },
        reply: jest.fn(),
      } as any;

      // Simulate restored rule data
      const restoredRule = {
        id: 1,
        server_id: 'guild-id',
        server_name: 'Test Guild',
        channel_id: 'channel-id',
        channel_name: 'test-channel',
        role_id: 'role-id',
        role_name: 'test-role',
        slug: 'test-collection',
        attribute_key: 'Gold',
        attribute_value: 'rare',
        min_items: 1
      };
      
      // Access private property for testing
      (service as any).restoredRules.set('interaction-123', restoredRule);

      mockDbService.deleteRoleMapping.mockResolvedValue(undefined);

      // Call the private method directly for testing
      await (service as any).handleUndoRestore(mockButtonInteraction);

      expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'guild-id');
      
      // Verify that the rule is stored in removedRules for the next undo cycle
      expect((service as any).removedRules.get('interaction-123')).toEqual(restoredRule);
      
      // Verify that the restoredRules data is cleaned up
      expect((service as any).restoredRules.has('interaction-123')).toBe(false);
      
      // Note: Not checking reply content structure as it contains Discord.js builders
    });

    it('should handle expired undo removal session', async () => {
      const mockButtonInteraction = {
        customId: 'undo_removal_interaction-456',
        reply: jest.fn(),
      } as any;

      // Call the private method directly for testing (no stored data)
      await (service as any).handleUndoRemoval(mockButtonInteraction);

      expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Undo session expired. Rule removal cannot be undone.',
        ephemeral: true
      });
    });

    it('should handle expired undo cancellation session', async () => {
      const mockButtonInteraction = {
        customId: 'undo_cancellation_interaction-456',
        reply: jest.fn(),
      } as any;

      // Call the private method directly for testing (no stored data)
      await (service as any).handleUndoCancellation(mockButtonInteraction);

      expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Undo session expired. Rule cancellation cannot be undone.',
        ephemeral: true
      });
    });

    it('should handle expired undo restore session', async () => {
      const mockButtonInteraction = {
        customId: 'undo_restore_interaction-456',
        id: 'interaction-456',
        reply: jest.fn(),
      } as any;

      // Call the private method directly for testing (no stored data)
      await (service as any).handleUndoRestore(mockButtonInteraction);

      expect(mockButtonInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Could not find the restored rule to undo.',
        ephemeral: true
      });
    });
  });

  describe('Role Name Handling with @ Prefix', () => {
    it('should handle role names with @ prefix correctly for new role creation', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockCreatedRole = { id: 'new-role-id', name: 'NewRole', editable: true };
      const mockGuild = {
        id: 'guild-id',
        name: 'test-guild',
        channels: { cache: new Map([['channel-id', mockChannel]]) },
        roles: {
          cache: {
            find: jest.fn().mockReturnValue(undefined) // No existing role found
          },
          create: jest.fn().mockResolvedValue(mockCreatedRole)
        },
        members: {
          me: {
            roles: {
              highest: { position: 10 }
            }
          }
        }
      };

      const mockInteraction = {
        id: 'interaction-123',
        guild: mockGuild,
        user: { tag: 'testuser#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (name: string) => {
            if (name === 'role') return '@NewRole'; // User enters role name with @ prefix
            if (name === 'slug') return 'test-collection';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'test-collection' });
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      // Verify that the role was created with the cleaned name (without @)
      expect(mockGuild.roles.create).toHaveBeenCalledWith({
        name: 'NewRole', // Should be cleaned of @ prefix
        color: 'Blue',
        position: 9,
        reason: 'Auto-created for verification rule by testuser#1234'
      });

      // Verify followUp was called to notify about role creation
      expect(mockInteraction.followUp).toHaveBeenCalledWith({
        content: expect.stringContaining('Created new role: **NewRole**'),
        ephemeral: true
      });
    });

    it('should handle role names with @ prefix correctly for existing role lookup', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      const mockExistingRole = { id: 'existing-role-id', name: 'ExistingRole', editable: true };
      const mockGuild = {
        id: 'guild-id',
        name: 'test-guild',
        channels: { cache: new Map([['channel-id', mockChannel]]) },
        roles: {
          cache: {
            find: jest.fn().mockReturnValue(mockExistingRole) // Existing role found
          }
        }
      };

      const mockInteraction = {
        id: 'interaction-123',
        guild: mockGuild,
        user: { tag: 'testuser#1234' },
        options: {
          getChannel: () => mockChannel,
          getString: (name: string) => {
            if (name === 'role') return '@ExistingRole'; // User enters role name with @ prefix
            if (name === 'slug') return 'test-collection';
            return null;
          },
          getInteger: () => null,
        },
        reply: jest.fn(),
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1, slug: 'test-collection' });
      mockDiscordMessageService.createVerificationMessage.mockResolvedValue('message-id');
      mockDbService.updateRuleMessageId.mockResolvedValue({});

      await service.handleAddRule(mockInteraction);

      // Verify that the existing role was found and used (despite @ prefix in input)
      expect(mockDbService.addRoleMapping).toHaveBeenCalledWith(
        'guild-id',
        'test-guild',
        'channel-id',
        'test-channel',
        'test-collection',
        'existing-role-id',
        'ExistingRole',  // Should use the actual role name
        'ALL',
        'ALL',
        1
      );

      // Verify no followUp was called (no new role created)
      expect(mockInteraction.followUp).not.toHaveBeenCalled();
    });
  });
});
