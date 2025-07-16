import { Test, TestingModule } from '@nestjs/testing';
import { ListRulesHandler } from '../src/services/discord-commands/handlers/list-rules.handler';
import { DbService } from '../src/services/db.service';
import { AdminFeedback } from '../src/services/utils/admin-feedback.util';
import { formatAttribute } from '../src/services/discord-commands/utils/rule-validation.util';

describe('ListRulesHandler', () => {
  let handler: ListRulesHandler;
  let mockDbService: jest.Mocked<DbService>;
  let mockInteraction: any;

  beforeEach(async () => {
    // Create mock DbService
    mockDbService = {
      getRoleMappings: jest.fn(),
    } as any;

    // Create mock interaction
    mockInteraction = {
      guild: {
        id: 'test-guild-id',
      },
      deferReply: jest.fn(),
      editReply: jest.fn(),
      reply: jest.fn(),
      deferred: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListRulesHandler,
        {
          provide: DbService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    handler = module.get<ListRulesHandler>(ListRulesHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handle', () => {
    it('should handle empty rules list', async () => {
      mockDbService.getRoleMappings.mockResolvedValue([]);

      await handler.handle(mockInteraction);

      expect(mockInteraction.deferReply).toHaveBeenCalledWith({
        flags: expect.any(Number), // MessageFlags.Ephemeral
      });
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [AdminFeedback.info('Verification Rules', 'No verification rules found.')],
      });
    });

    it('should handle single rule', async () => {
      const mockRule = {
        id: 1,
        server_id: 'test-guild-id',
        channel_id: 'channel-123',
        role_id: 'role-456',
        slug: 'test-collection',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 1,
      };

      mockDbService.getRoleMappings.mockResolvedValue([mockRule]);

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          AdminFeedback.info(
            'Verification Rules',
            'ID: 1 | Channel: <#channel-123> | Role: <@&role-456> | Slug: test-collection | Attr: trait=rare | Min: 1'
          ),
        ],
      });
    });

    it('should handle multiple rules and sort by ID', async () => {
      const mockRules = [
        {
          id: 3,
          server_id: 'test-guild-id',
          channel_id: 'channel-789',
          role_id: 'role-999',
          slug: 'ALL',
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 2,
        },
        {
          id: 1,
          server_id: 'test-guild-id',
          channel_id: 'channel-123',
          role_id: 'role-456',
          slug: 'test-collection',
          attribute_key: 'trait',
          attribute_value: 'rare',
          min_items: 1,
        },
      ];

      mockDbService.getRoleMappings.mockResolvedValue(mockRules);

      await handler.handle(mockInteraction);

      // Should be sorted by ID (1 then 3)
      const expectedDescription = 
        'ID: 1 | Channel: <#channel-123> | Role: <@&role-456> | Slug: test-collection | Attr: trait=rare | Min: 1\n\n' +
        'ID: 3 | Channel: <#channel-789> | Role: <@&role-999> | Slug: ALL | Attr: ALL | Min: 2';

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [AdminFeedback.info('Verification Rules', expectedDescription)],
      });
    });

    it('should filter out system rules', async () => {
      const mockRules = [
        {
          id: 1,
          server_id: 'test-guild-id',
          channel_id: 'channel-123',
          role_id: 'role-456',
          slug: 'test-collection',
          attribute_key: 'trait',
          attribute_value: 'rare',
          min_items: 1,
        },
        {
          id: 2,
          server_id: '000000000000000000', // System rule - should be filtered out
          channel_id: 'system-channel',
          role_id: 'system-role',
          slug: 'system',
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 1,
        },
      ];

      mockDbService.getRoleMappings.mockResolvedValue(mockRules);

      await handler.handle(mockInteraction);

      // Should only show the non-system rule
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [
          AdminFeedback.info(
            'Verification Rules',
            'ID: 1 | Channel: <#channel-123> | Role: <@&role-456> | Slug: test-collection | Attr: trait=rare | Min: 1'
          ),
        ],
      });
    });

    it('should handle various attribute formats', async () => {
      const mockRules = [
        {
          id: 1,
          server_id: 'test-guild-id',
          channel_id: 'channel-123',
          role_id: 'role-456',
          slug: 'test-collection',
          attribute_key: 'trait',
          attribute_value: 'rare',
          min_items: 1,
        },
        {
          id: 2,
          server_id: 'test-guild-id',
          channel_id: 'channel-234',
          role_id: 'role-567',
          slug: 'another-collection',
          attribute_key: 'type',
          attribute_value: 'ALL',
          min_items: 1,
        },
        {
          id: 3,
          server_id: 'test-guild-id',
          channel_id: 'channel-345',
          role_id: 'role-678',
          slug: 'third-collection',
          attribute_key: 'ALL',
          attribute_value: 'legendary',
          min_items: 1,
        },
        {
          id: 4,
          server_id: 'test-guild-id',
          channel_id: 'channel-456',
          role_id: 'role-789',
          slug: 'fourth-collection',
          attribute_key: 'ALL',
          attribute_value: 'ALL',
          min_items: 1,
        },
      ];

      mockDbService.getRoleMappings.mockResolvedValue(mockRules);

      await handler.handle(mockInteraction);

      const expectedDescription = 
        'ID: 1 | Channel: <#channel-123> | Role: <@&role-456> | Slug: test-collection | Attr: trait=rare | Min: 1\n\n' +
        'ID: 2 | Channel: <#channel-234> | Role: <@&role-567> | Slug: another-collection | Attr: type (any value) | Min: 1\n\n' +
        'ID: 3 | Channel: <#channel-345> | Role: <@&role-678> | Slug: third-collection | Attr: ALL=legendary | Min: 1\n\n' +
        'ID: 4 | Channel: <#channel-456> | Role: <@&role-789> | Slug: fourth-collection | Attr: ALL | Min: 1';

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        embeds: [AdminFeedback.info('Verification Rules', expectedDescription)],
      });
    });

    it('should handle database errors', async () => {
      const errorMessage = 'Database connection failed';
      mockDbService.getRoleMappings.mockRejectedValue(new Error(errorMessage));
      mockInteraction.deferred = true;

      await handler.handle(mockInteraction);

      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: AdminFeedback.simple(`Error retrieving rules: ${errorMessage}`, true),
      });
    });

    it('should handle errors when interaction is not deferred', async () => {
      const errorMessage = 'Database connection failed';
      
      // Simulate error during deferReply
      mockInteraction.deferReply.mockRejectedValue(new Error('Defer failed'));
      mockInteraction.deferred = false;

      await handler.handle(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: AdminFeedback.simple('Error retrieving rules: Defer failed', true),
        flags: 64,
      });
    });
  });

  describe('formatting methods', () => {
    it('should format attributes correctly', () => {
      // Test the centralized utility function
      expect(formatAttribute('trait', 'rare')).toBe('trait=rare');
      expect(formatAttribute('type', 'ALL')).toBe('type (any value)');
      expect(formatAttribute('ALL', 'legendary')).toBe('ALL=legendary');
      expect(formatAttribute('ALL', 'ALL')).toBe('ALL');
    });
  });
});
