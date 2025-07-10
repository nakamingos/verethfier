import { Test, TestingModule } from '@nestjs/testing';
import { RemoveRuleHandler } from '../src/services/discord-commands/handlers/remove-rule.handler';
import { DbService } from '../src/services/db.service';
import { ChatInputCommandInteraction } from 'discord.js';
import { AdminFeedback } from '../src/services/utils/admin-feedback.util';

describe('RemoveRuleHandler', () => {
  let handler: RemoveRuleHandler;
  let mockDbService: jest.Mocked<DbService>;
  let mockInteraction: any;
  let mockGetString: jest.Mock;

  beforeEach(async () => {
    // Create mock DbService
    mockDbService = {
      getRoleMappings: jest.fn(),
      deleteRoleMapping: jest.fn(),
    } as any;

    // Create mock getString function
    mockGetString = jest.fn();

    // Create mock interaction
    mockInteraction = {
      options: {
        getString: mockGetString,
      },
      guild: {
        id: 'test-guild-id',
      },
      id: 'test-interaction-id',
      deferReply: jest.fn(),
      editReply: jest.fn(),
      followUp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoveRuleHandler,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    handler = module.get<RemoveRuleHandler>(RemoveRuleHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handle', () => {
    it('should handle missing rule ID input', async () => {
      mockGetString.mockReturnValue(null);

      await handler.handle(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: expect.any(Number), // MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: AdminFeedback.simple('Rule ID is required.', true),
      });
    });

    it('should parse single rule ID correctly', async () => {
      const mockRule = {
        id: 1,
        server_id: 'test-guild-id',
        channel_id: 'test-channel-id',
        role_id: 'test-role-id',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
        channel_name: 'test-channel',
        role_name: 'test-role',
      };

      mockGetString.mockReturnValue('1');
      mockDbService.getRoleMappings.mockResolvedValue([mockRule]);
      mockDbService.deleteRoleMapping.mockResolvedValue(undefined);

      await handler.handle(mockInteraction);

      expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('test-guild-id');
      expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'test-guild-id');
      
      // Verify the response contains the success embed
      const editReplyCall = mockInteraction.editReply.mock.calls[0][0];
      expect(editReplyCall).toHaveProperty('embeds');
      expect(editReplyCall.embeds).toHaveLength(1);
      
      // The embed is an EmbedBuilder object, let's check its data
      const embedData = editReplyCall.embeds[0].data || editReplyCall.embeds[0];
      expect(embedData.title).toBe('✅ Rule Removed');
      expect(embedData.description).toBe('Rule 1 for test-channel and @test-role has been removed.');
      expect(embedData.color).toBe(65280);
      expect(embedData.fields).toHaveLength(3);
      expect(editReplyCall).toHaveProperty('components');
    });

    it('should handle rule not found', async () => {
      mockGetString.mockReturnValue('999');
      mockDbService.getRoleMappings.mockResolvedValue([]);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: AdminFeedback.simple('Rule 999 not found.', true),
      });
    });

    it('should handle invalid rule ID format', async () => {
      mockGetString.mockReturnValue('abc');

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: AdminFeedback.simple('Error: Invalid rule ID format: "abc" is not a valid rule ID', true),
      });
    });
  });

  describe('undo functionality', () => {
    it('should store removed rule data for undo', async () => {
      const mockRule = {
        id: 1,
        server_id: 'test-guild-id',
        channel_id: 'test-channel-id',
        role_id: 'test-role-id',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
        channel_name: 'test-channel',
        role_name: 'test-role',
      };

      mockGetString.mockReturnValue('1');
      mockDbService.getRoleMappings.mockResolvedValue([mockRule]);
      mockDbService.deleteRoleMapping.mockResolvedValue(undefined);

      await handler.handle(mockInteraction);

      // Verify that undo data is stored
      const storedData = handler.getRemovedRuleData('test-interaction-id');
      expect(storedData).toEqual(mockRule);
    });

    it('should allow clearing of stored undo data', () => {
      // Set some data
      const testData = { id: 1, test: 'data' };
      (handler as any).removedRules.set('test-id', testData);

      // Verify it's there
      expect(handler.getRemovedRuleData('test-id')).toEqual(testData);

      // Clear it
      handler.clearRemovedRuleData('test-id');

      // Verify it's gone
      expect(handler.getRemovedRuleData('test-id')).toBeUndefined();
    });
  });
});
