import { Test, TestingModule } from '@nestjs/testing';
import { AddRuleHandler } from '../src/services/discord-commands/handlers/add-rule.handler';
import { DbService } from '../src/services/db.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DiscordService } from '../src/services/discord.service';
import { DataService } from '../src/services/data.service';
import { RuleConfirmationInteractionHandler } from '../src/services/discord-commands/interactions/rule-confirmation.interaction';
import { DuplicateRuleConfirmationInteractionHandler } from '../src/services/discord-commands/interactions/duplicate-rule-confirmation.interaction';
import { RemovalUndoInteractionHandler } from '../src/services/discord-commands/interactions/removal-undo.interaction';
import { ChannelType } from 'discord.js';

const mockDbService = {
  checkForExactDuplicateRule: jest.fn(),
  checkForDuplicateRule: jest.fn(),
  checkForDuplicateRole: jest.fn(),
  addRoleMapping: jest.fn(),
  getRulesByChannel: jest.fn(),
  updateRuleMessageId: jest.fn(),
};

const mockDiscordMessageService = {
  findExistingVerificationMessage: jest.fn(),
  createVerificationMessage: jest.fn(),
};

const mockDiscordService = {
  getRole: jest.fn(),
};

const mockDataService = {
  getAllSlugs: jest.fn(),
};

const mockRemovalUndoInteractionHandler = {
  setupRemovalButtonHandler: jest.fn(),
};

const mockRuleConfirmationHandler = {
  storeConfirmationData: jest.fn(),
  createConfirmationButtons: jest.fn().mockReturnValue({
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        custom_id: 'undo_rule_test',
        label: 'Undo',
        style: 4, // Danger
        emoji: { name: '↩️' }
      }
    ]
  }),
  setupConfirmationButtonHandler: jest.fn(),
};

const mockDuplicateRuleConfirmationHandler = {
  storeRuleData: jest.fn(),
  createDuplicateRuleButtons: jest.fn().mockReturnValue({
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        custom_id: 'confirm_duplicate_test',
        label: 'Create Anyway',
        style: 4, // Danger
        emoji: { name: '✅' }
      },
      {
        type: 2, // Button
        custom_id: 'cancel_duplicate_test',
        label: 'Cancel',
        style: 2, // Secondary
        emoji: { name: '❌' }
      }
    ]
  }),
  setupDuplicateRuleButtonHandler: jest.fn(),
  createUndoRemovalButton: jest.fn().mockReturnValue({
    type: 1, // ActionRow
    components: [
      {
        type: 2, // Button
        custom_id: 'undo_cancellation_test',
        label: 'Undo',
        style: 1, // Primary
        emoji: { name: '↩️' }
      }
    ]
  }),
  setupCancellationButtonHandler: jest.fn(),
  getPendingRule: jest.fn(),
  deletePendingRule: jest.fn(),
  storeCancelledRule: jest.fn(),
  getCancelledRule: jest.fn(),
  deleteCancelledRule: jest.fn(),
  createRuleInfoFields: jest.fn().mockReturnValue([
    { name: '**Collection**', value: 'test-collection', inline: true },
    { name: '**Attribute**', value: 'test-attribute=test-value', inline: true },
    { name: '**Min Items**', value: '1', inline: true }
  ]),
};

describe('AddRuleHandler', () => {
  let handler: AddRuleHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddRuleHandler,
        { provide: DbService, useValue: mockDbService },
        { provide: DiscordMessageService, useValue: mockDiscordMessageService },
        { provide: DiscordService, useValue: mockDiscordService },
        { provide: DataService, useValue: mockDataService },
        { provide: RuleConfirmationInteractionHandler, useValue: mockRuleConfirmationHandler },
        { provide: DuplicateRuleConfirmationInteractionHandler, useValue: mockDuplicateRuleConfirmationHandler },
      ],
    }).compile();

    handler = module.get<AddRuleHandler>(AddRuleHandler);
    jest.clearAllMocks();
    
    // Setup default mock return values
    mockDataService.getAllSlugs.mockResolvedValue(['test-collection', 'another-collection', 'example-slug']);
  });

  describe('handle', () => {
    it('should validate input parameters', async () => {
      const mockInteraction = {
        id: 'interaction-123',
        guild: { id: 'guild-id', name: 'test-guild' },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: jest.fn().mockReturnValue(null), // Invalid channel
          getString: jest.fn().mockReturnValue('Test Role'),
          getInteger: jest.fn(),
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
      } as any;

      await handler.handle(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Channel and role are required')
      });
    });

    it('should successfully validate correct input parameters', async () => {
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
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel),
          getString: jest.fn((key: string) => {
            if (key === 'role') return 'Test Role';
            if (key === 'slug') return 'test-collection';
            return null;
          }),
          getInteger: jest.fn().mockReturnValue(null),
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      // Mock successful validation and creation
      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(false);

      await handler.handle(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 });
      // Should get to duplicate checking since validation passed
      expect(mockDbService.checkForExactDuplicateRule).toHaveBeenCalled();
    });

    it('should handle role creation for new roles', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel', type: ChannelType.GuildText };
      
      const mockInteraction = {
        id: 'interaction-123',
        guild: {
          id: 'guild-id',
          name: 'test-guild',
          roles: {
            cache: {
              find: jest.fn().mockReturnValue(null) // Role doesn't exist
            },
            create: jest.fn().mockResolvedValue({
              id: 'new-role-id',
              name: 'New Role',
              editable: true
            })
          },
          members: {
            me: {
              roles: {
                highest: { position: 5 }
              }
            }
          }
        },
        user: { tag: 'test-user#1234' },
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel),
          getString: jest.fn((key: string) => {
            if (key === 'role') return 'New Role';
            if (key === 'slug') return 'test-collection';
            return null;
          }),
          getInteger: jest.fn().mockReturnValue(null),
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      // Mock successful validation and creation
      mockDbService.checkForExactDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRule.mockResolvedValue(null);
      mockDbService.checkForDuplicateRole.mockResolvedValue(null);
      mockDbService.getRulesByChannel.mockResolvedValue([]);
      mockDbService.addRoleMapping.mockResolvedValue({ id: 1 });
      mockDiscordMessageService.findExistingVerificationMessage.mockResolvedValue(false);

      await handler.handle(mockInteraction);

      expect(mockInteraction.guild.roles.create).toHaveBeenCalledWith({
        name: 'New Role',
        color: 'Blue',
        position: 4, // Bot's highest position (5) - 1
        reason: 'Auto-created for verification rule by test-user#1234'
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                fields: expect.arrayContaining([
                  expect.objectContaining({
                    name: '🆕 New Role Created',
                    value: `The role <@&new-role-id> was created for this verification rule.`
                  })
                ])
              })
            })
          ])
        })
      );
    });

    it('should detect exact duplicate rules', async () => {
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
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel),
          getString: jest.fn((key: string) => {
            if (key === 'role') return 'Test Role';
            if (key === 'slug') return 'test-collection';
            return null;
          }),
          getInteger: jest.fn().mockReturnValue(null),
        },
        deferReply: jest.fn(),
        editReply: jest.fn(),
        followUp: jest.fn(),
      } as any;

      // Mock exact duplicate found
      mockDbService.checkForExactDuplicateRule.mockResolvedValue({
        id: 1,
        role_id: 'role-id',
        slug: 'test-collection',
        attribute_key: 'ALL',
        attribute_value: 'ALL',
        min_items: 1
      });

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [expect.objectContaining({
          data: expect.objectContaining({
            title: expect.stringContaining('Exact Duplicate Rule'),
            color: 16711680, // Red color for error
          })
        })]
      });
    });
  });

  describe('validateInputParams', () => {
    it('should return null for missing channel', async () => {
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(null),
          getString: jest.fn().mockReturnValue('Test Role'),
          getInteger: jest.fn(),
        },
        editReply: jest.fn(),
      } as any;

      const result = await (handler as any).validateInputParams(mockInteraction);

      expect(result).toBeNull();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should return null for missing role', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel' };
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel),
          getString: jest.fn().mockReturnValue(null),
          getInteger: jest.fn(),
        },
        editReply: jest.fn(),
      } as any;

      const result = await (handler as any).validateInputParams(mockInteraction);

      expect(result).toBeNull();
      expect(mockInteraction.editReply).toHaveBeenCalled();
    });

    it('should return parameters with defaults for valid input', async () => {
      const mockChannel = { id: 'channel-id', name: 'test-channel' };
      const mockInteraction = {
        options: {
          getChannel: jest.fn().mockReturnValue(mockChannel),
          getString: jest.fn((key: string) => {
            if (key === 'role') return 'Test Role';
            return null; // All other strings return null for default testing
          }),
          getInteger: jest.fn().mockReturnValue(null),
        },
        editReply: jest.fn(),
      } as any;

      const result = await (handler as any).validateInputParams(mockInteraction);

      expect(result).toEqual({
        channel: mockChannel,
        roleName: 'Test Role',
        slug: 'ALL',
        attributeKey: 'ALL',
        attributeValue: 'ALL',
        minItems: 1
      });
    });
  });
});
