import { Test, TestingModule } from '@nestjs/testing';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { Logger } from '@nestjs/common';
import { ButtonStyle } from 'discord.js';

// Mock Logger methods to suppress error output during tests
const loggerSpy = jest.spyOn(Logger, 'error').mockImplementation(() => {});
const loggerDebugSpy = jest.spyOn(Logger, 'debug').mockImplementation(() => {});

const mockClient = {
  user: { id: 'bot-user-id' }
};

const mockChannel = {
  id: 'channel-id',
  name: 'test-channel',
  messages: {
    fetch: jest.fn(),
  },
  send: jest.fn(),
};

const mockMessage = {
  id: 'message-id',
  author: { id: 'bot-user-id' },
  embeds: [
    {
      title: 'Wallet Verification',
      description: 'Test description'
    }
  ],
  components: [
    {
      type: 1, // ActionRowBuilder type
      components: [
        {
          type: 2, // ButtonComponent type
          customId: 'requestVerification',
          label: 'Verify Now',
          style: ButtonStyle.Primary
        }
      ]
    }
  ]
};

const mockMessagesCollection = new Map([
  ['message-id', mockMessage]
]);

describe('DiscordMessageService', () => {
  let service: DiscordMessageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiscordMessageService],
    }).compile();

    service = module.get<DiscordMessageService>(DiscordMessageService);
    service.initialize(mockClient as any);
    jest.clearAllMocks();
    loggerSpy.mockClear();
    loggerDebugSpy.mockClear();
  });

  afterAll(() => {
    loggerSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  describe('findExistingVerificationMessage', () => {
    it('should find existing verification message (any bot message with buttons)', async () => {
      mockChannel.messages.fetch.mockResolvedValue(mockMessagesCollection);

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBe('message-id');
      expect(mockChannel.messages.fetch).toHaveBeenCalledWith({ limit: 100 });
    });

    it('should return null when no verification message found', async () => {
      const emptyMessages = new Map();
      mockChannel.messages.fetch.mockResolvedValue(emptyMessages);

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });

    it('should return null when client not initialized', async () => {
      const uninitializedService = new DiscordMessageService();

      const result = await uninitializedService.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });

    it('should return null when bot user ID not available', async () => {
      const clientWithoutUserId = { user: null };
      const serviceWithoutUserId = new DiscordMessageService();
      serviceWithoutUserId.initialize(clientWithoutUserId as any);

      const result = await serviceWithoutUserId.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });

    it('should handle messages from other bots', async () => {
      const otherBotMessage = {
        ...mockMessage,
        author: { id: 'other-bot-id' }
      };
      const messagesWithOtherBot = new Map([
        ['other-message-id', otherBotMessage]
      ]);
      mockChannel.messages.fetch.mockResolvedValue(messagesWithOtherBot);

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });

    it('should return null for bot messages without buttons', async () => {
      const messageWithoutButtons = {
        ...mockMessage,
        components: []
      };
      const messagesWithoutButtons = new Map([
        ['no-button-message', messageWithoutButtons]
      ]);
      mockChannel.messages.fetch.mockResolvedValue(messagesWithoutButtons);

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });

    it('should find bot message with any button (legacy or new)', async () => {
      const legacyMessage = {
        id: 'legacy-message-id',
        author: { id: 'bot-user-id' },
        embeds: [{ title: 'Different Title' }], // Different embed title
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                customId: 'legacyVerify',
                label: 'Legacy Verify',
                style: ButtonStyle.Secondary
              }
            ]
          }
        ]
      };
      const messagesWithLegacy = new Map([
        ['legacy-message-id', legacyMessage]
      ]);
      mockChannel.messages.fetch.mockResolvedValue(messagesWithLegacy);

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBe('legacy-message-id');
    });

    it('should handle fetch errors gracefully', async () => {
      mockChannel.messages.fetch.mockRejectedValue(new Error('Fetch failed'));

      const result = await service.findExistingVerificationMessage(mockChannel as any);

      expect(result).toBeNull();
    });
  });

  describe('createVerificationMessage', () => {
    it('should create verification message successfully', async () => {
      const sentMessage = { id: 'new-message-id' };
      mockChannel.send.mockResolvedValue(sentMessage);

      const result = await service.createVerificationMessage(mockChannel as any);

      expect(result).toBe('new-message-id');
      expect(mockChannel.send).toHaveBeenCalledWith({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              title: 'Wallet Verification'
            })
          })
        ]),
        components: expect.arrayContaining([
          expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                data: expect.objectContaining({
                  label: 'Verify Now',
                  custom_id: 'requestVerification'
                })
              })
            ])
          })
        ])
      });
    });

    it('should handle send errors', async () => {
      mockChannel.send.mockRejectedValue(new Error('Send failed'));

      await expect(service.createVerificationMessage(mockChannel as any)).rejects.toThrow('Send failed');
    });
  });
});
