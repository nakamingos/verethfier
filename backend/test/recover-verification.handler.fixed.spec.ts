import { Test, TestingModule } from '@nestjs/testing';
import { RecoverVerificationHandler } from '../src/services/discord-commands/handlers/recover-verification.handler';
import { DbService } from '../src/services/db.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { ChannelType } from 'discord.js';

describe('RecoverVerificationHandler', () => {
  let handler: RecoverVerificationHandler;
  let mockDbService: jest.Mocked<DbService>;
  let mockMessageService: jest.Mocked<DiscordMessageService>;
  let mockInteraction: any;

  beforeEach(async () => {
    // Create mock services
    mockDbService = {
      getRulesByChannel: jest.fn(),
    } as any;

    mockMessageService = {
      findExistingVerificationMessage: jest.fn(),
      createVerificationMessage: jest.fn(),
    } as any;

    // Create mock interaction
    mockInteraction = {
      guild: {
        id: 'test-guild-id',
      },
      options: {
        getChannel: jest.fn(),
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
      deferred: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoverVerificationHandler,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: DiscordMessageService,
          useValue: mockMessageService,
        },
      ],
    }).compile();

    handler = module.get<RecoverVerificationHandler>(RecoverVerificationHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handle', () => {
    it('should handle missing channel', async () => {
      mockInteraction.options.getChannel.mockReturnValue(null);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Please specify a valid text channel'),
      });
    });

    it('should handle invalid channel type', async () => {
      const mockChannel = {
        id: 'channel-123',
        type: ChannelType.GuildVoice, // Not a text channel
      };
      mockInteraction.options.getChannel.mockReturnValue(mockChannel);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Please specify a valid text channel'),
      });
    });

    it('should handle channel with existing verification message', async () => {
      const mockChannel = {
        id: 'channel-123',
        type: ChannelType.GuildText,
        name: 'test-channel',
      };
      mockInteraction.options.getChannel.mockReturnValue(mockChannel);
      mockMessageService.findExistingVerificationMessage.mockResolvedValue(true);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('already has a verification message'),
      });
    });

    it('should handle channel with no rules', async () => {
      const mockChannel = {
        id: 'channel-123',
        type: ChannelType.GuildText,
        name: 'test-channel',
      };
      mockInteraction.options.getChannel.mockReturnValue(mockChannel);
      mockMessageService.findExistingVerificationMessage.mockResolvedValue(false);
      mockDbService.getRulesByChannel.mockResolvedValue([]);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('No verification rules found'),
      });
    });

    it('should successfully create verification message', async () => {
      const mockChannel = {
        id: 'channel-123',
        type: ChannelType.GuildText,
        name: 'test-channel',
        toString: () => '<#channel-123>',
      };
      const mockRules = [
        {
          id: 1,
          server_id: 'test-guild-id',
          server_name: 'Test Guild',
          channel_id: 'channel-123',
          channel_name: 'test-channel',
          role_id: 'role-456',
          role_name: 'Test Role 1',
          slug: 'test-collection',
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 1,
        },
        {
          id: 2,
          server_id: 'test-guild-id',
          server_name: 'Test Guild',
          channel_id: 'channel-123',
          channel_name: 'test-channel',
          role_id: 'role-789',
          role_name: 'Test Role 2',
          slug: 'another-collection',
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 1,
        },
      ];

      mockInteraction.options.getChannel.mockReturnValue(mockChannel);
      mockMessageService.findExistingVerificationMessage.mockResolvedValue(false);
      mockDbService.getRulesByChannel.mockResolvedValue(mockRules);
      mockMessageService.createVerificationMessage.mockResolvedValue(undefined);

      await handler.handle(mockInteraction);

      expect(mockMessageService.createVerificationMessage).toHaveBeenCalledWith(mockChannel);
      
      // Verify that editReply was called with an embed structure
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: expect.stringContaining('Verification Message Created'),
              description: expect.stringContaining('<#channel-123>'),
            })
          })
        ])
      });
    });

    it('should handle errors gracefully', async () => {
      const mockChannel = {
        id: 'channel-123',
        type: ChannelType.GuildText,
        name: 'test-channel',
      };
      mockInteraction.options.getChannel.mockReturnValue(mockChannel);
      mockMessageService.findExistingVerificationMessage.mockRejectedValue(new Error('Test error'));
      
      // Mock deferReply to set deferred to true
      mockInteraction.deferReply.mockImplementation(() => {
        mockInteraction.deferred = true;
        return Promise.resolve();
      });

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: expect.stringContaining('Error'),
      });
    });
  });
});
