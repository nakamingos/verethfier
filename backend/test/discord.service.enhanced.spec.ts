import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../src/services/discord.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';
import { DiscordCommandsService } from '../src/services/discord-commands.service';
import { DbService } from '../src/services/db.service';
import { NonceService } from '../src/services/nonce.service';
import { VerificationService } from '../src/services/verification.service';
import { Logger } from '@nestjs/common';

// Mock Discord.js client and related objects
const mockUser = { id: 'user123', tag: 'TestBot#1234' };
const mockGuild = { 
  id: 'guild123', 
  members: { 
    me: { 
      roles: { highest: { position: 10 } } 
    } 
  },
  roles: {
    cache: new Map(),
    fetch: jest.fn()
  }
};
const mockRole = { id: 'role123', name: 'TestRole', position: 5, editable: true };

const mockClient = {
  on: jest.fn(),
  login: jest.fn().mockResolvedValue(''),
  users: {
    fetch: jest.fn().mockResolvedValue(mockUser)
  },
  guilds: {
    cache: new Map([['guild123', mockGuild]]),
    fetch: jest.fn().mockResolvedValue(mockGuild)
  },
  user: mockUser
};

const mockRest = {
  setToken: jest.fn().mockReturnThis(),
  put: jest.fn().mockResolvedValue({})
};

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    REST: jest.fn().mockImplementation(() => mockRest),
    Client: jest.fn().mockImplementation(() => mockClient),
    Routes: {
      applicationCommands: jest.fn().mockReturnValue('applications/123/commands')
    },
    SlashCommandBuilder: jest.fn().mockImplementation(() => ({
      setName: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      addSubcommand: jest.fn().mockReturnThis(),
      addChannelOption: jest.fn().mockReturnThis(),
      addStringOption: jest.fn().mockReturnThis(),
      addIntegerOption: jest.fn().mockReturnThis()
    })),
    Events: { ClientReady: 'ready' },
    GatewayIntentBits: { Guilds: 1 },
    MessageFlags: { Ephemeral: 64 }
  };
});

const mockDbService = {
  addRoleMapping: jest.fn(),
  deleteRoleMapping: jest.fn(),
  getRoleMappings: jest.fn(),
  getAllRulesWithLegacy: jest.fn(),
  removeAllLegacyRoles: jest.fn(),
  getLegacyRoles: jest.fn(),
  ruleExists: jest.fn(),
  insertRoleMapping: jest.fn(),
  findRuleByMessageId: jest.fn(),
  getServerRole: jest.fn(),
};

const mockNonceService = {
  createNonce: jest.fn(),
  getNonceData: jest.fn(),
  invalidateNonce: jest.fn(),
};

const mockDiscordMessageService = {
  initialize: jest.fn(),
  findExistingVerificationMessage: jest.fn(),
  createVerificationMessage: jest.fn(),
  doesVerificationMessageExist: jest.fn(),
};

const mockDiscordVerificationService = {
  initialize: jest.fn(),
  requestVerification: jest.fn(),
  addUserRole: jest.fn(),
  throwError: jest.fn(),
  getVerificationRoleId: jest.fn(),
};

const mockDiscordCommandsService = {
  initialize: jest.fn(),
  handleAddRule: jest.fn(),
  handleRemoveRule: jest.fn(),
  handleListRules: jest.fn(),
  handleRecoverVerification: jest.fn(),
};

const mockVerificationService = {
  verifyWallet: jest.fn(),
};

describe('DiscordService - Enhanced Tests', () => {
  let service: DiscordService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      DISCORD: '0', // Disable Discord bot initialization in tests
      DISCORD_BOT_TOKEN: 'test_bot_token',
      DISCORD_CLIENT_ID: 'test-client-id',
      NONCE_EXPIRY: '3600'
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        { provide: NonceService, useValue: mockNonceService },
        { provide: DbService, useValue: mockDbService },
        { provide: DiscordMessageService, useValue: mockDiscordMessageService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
        { provide: DiscordCommandsService, useValue: mockDiscordCommandsService },
        { provide: VerificationService, useValue: mockVerificationService },
      ],
    }).compile();
    service = module.get<DiscordService>(DiscordService);
    jest.clearAllMocks();
    
    // Set up client for tests that need it
    (service as any).client = mockClient;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize bot successfully', async () => {
      // Reset client to null to test initialization
      (service as any).client = null;
      
      let readyCallback: Function;
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          readyCallback = callback;
        }
      });

      const initPromise = service.initializeBot();
      
      // Simulate ready event
      if (readyCallback) {
        readyCallback(mockClient);
      }

      await initPromise;

      expect(mockClient.login).toHaveBeenCalledWith('test_bot_token');
      expect(mockDiscordMessageService.initialize).toHaveBeenCalledWith(mockClient);
      expect(mockDiscordVerificationService.initialize).toHaveBeenCalledWith(mockClient);
      expect(mockDiscordCommandsService.initialize).toHaveBeenCalledWith(mockClient);
    });

    it('should not initialize bot multiple times', async () => {
      // First initialization
      (service as any).client = null;
      
      let readyCallback: Function;
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'ready') {
          readyCallback = callback;
        }
      });

      const firstInitPromise = service.initializeBot();
      
      // Simulate ready event for first initialization
      if (readyCallback) {
        readyCallback(mockClient);
      }

      await firstInitPromise;
      
      // Reset mock call count
      mockClient.login.mockClear();
      
      // Second initialization should be a no-op
      await service.initializeBot();
      
      expect(mockClient.login).toHaveBeenCalledTimes(0); // Should not be called again
    });

    it('should handle bot initialization errors', async () => {
      (service as any).client = null;
      
      // Mock login to reject
      const loginError = new Error('Login failed');
      mockClient.login.mockRejectedValueOnce(loginError);
      
      // Mock the client creation and events
      mockClient.on.mockImplementation((event, callback) => {
        // Don't need to manually trigger events since login rejection will handle it
      });

      // The initializeBot should reject with the login error
      await expect(service.initializeBot()).rejects.toThrow('Login failed');
      
      // Verify login was attempted
      expect(mockClient.login).toHaveBeenCalledWith('test_bot_token');
    });
  });

  describe('Slash Commands Registration', () => {
    it('should register slash commands successfully', async () => {
      await service.registerSlashCommands();
      
      expect(mockRest.put).toHaveBeenCalledWith(
        'applications/123/commands',
        { body: expect.any(Array) }
      );
    });

    it('should handle slash command registration errors', async () => {
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      mockRest.put.mockRejectedValueOnce(new Error('Registration failed'));
      
      await service.registerSlashCommands();
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to register slash commands:', expect.any(Error));
      loggerErrorSpy.mockRestore();
    });

    it('should create slash commands with interaction handlers', async () => {
      await service.createSlashCommands();
      
      expect(mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
    });
  });

  describe('Discord API Interactions', () => {
    beforeEach(() => {
      mockGuild.roles.fetch.mockResolvedValue(mockRole);
    });

    describe('getUser', () => {
      it('should fetch user successfully', async () => {
        const result = await service.getUser('user123');
        
        expect(mockClient.users.fetch).toHaveBeenCalledWith('user123');
        expect(result).toEqual(mockUser);
      });

      it('should handle user fetch errors', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        mockClient.users.fetch.mockRejectedValueOnce(new Error('User not found'));
        
        const result = await service.getUser('invalid-user');
        
        expect(result).toBeNull();
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          'Failed to fetch user invalid-user:',
          'User not found'
        );
        loggerWarnSpy.mockRestore();
      });

      it('should handle no client initialized', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        (service as any).client = null;
        
        const result = await service.getUser('user123');
        
        expect(result).toBeNull();
        // No warning logged when client isn't initialized (for non-critical name resolution)
        loggerWarnSpy.mockRestore();
        
        (service as any).client = mockClient;
      });
    });

    describe('getGuild', () => {
      it('should fetch guild successfully', async () => {
        const result = await service.getGuild('guild123');
        
        expect(mockClient.guilds.fetch).toHaveBeenCalledWith('guild123');
        expect(result).toEqual(mockGuild);
      });

      it('should handle guild fetch errors', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        mockClient.guilds.fetch.mockRejectedValueOnce(new Error('Guild not found'));
        
        const result = await service.getGuild('invalid-guild');
        
        expect(result).toBeNull();
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          'Failed to fetch guild invalid-guild:',
          'Guild not found'
        );
        loggerWarnSpy.mockRestore();
      });

      it('should handle no client initialized', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        (service as any).client = null;
        
        const result = await service.getGuild('guild123');
        
        expect(result).toBeNull();
        // No warning logged when client isn't initialized (for non-critical name resolution)
        loggerWarnSpy.mockRestore();
        
        (service as any).client = mockClient;
      });
    });

    describe('getRole', () => {
      it('should fetch role successfully', async () => {
        const result = await service.getRole('guild123', 'role123');
        
        expect(mockClient.guilds.fetch).toHaveBeenCalledWith('guild123');
        expect(mockGuild.roles.fetch).toHaveBeenCalledWith('role123');
        expect(result).toEqual(mockRole);
      });

      it('should handle role fetch errors', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        mockGuild.roles.fetch.mockRejectedValueOnce(new Error('Role not found'));
        
        const result = await service.getRole('guild123', 'invalid-role');
        
        expect(result).toBeNull();
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          'Failed to fetch role invalid-role in guild guild123:',
          'Role not found'
        );
        loggerWarnSpy.mockRestore();
      });

      it('should handle no client initialized', async () => {
        const loggerWarnSpy = jest.spyOn(Logger, 'warn').mockImplementation();
        (service as any).client = null;
        
        const result = await service.getRole('guild123', 'role123');
        
        expect(result).toBeNull();
        // No warning logged when client isn't initialized (for non-critical name resolution)
        loggerWarnSpy.mockRestore();
        
        (service as any).client = mockClient;
      });
    });
  });

  describe('Command Handling', () => {
    it('should handle add-rule command', async () => {
      const mockInteraction = {
        options: { getSubcommand: () => 'add-rule' },
        guild: { id: 'g' },
        deferred: false,
        replied: false
      } as any;
      
      await service.handleSetup(mockInteraction);
      expect(mockDiscordCommandsService.handleAddRule).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle remove-rule command', async () => {
      const mockInteraction = {
        options: { getSubcommand: () => 'remove-rule' },
        guild: { id: 'g' },
        deferred: false,
        replied: false
      } as any;
      
      await service.handleSetup(mockInteraction);
      expect(mockDiscordCommandsService.handleRemoveRule).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle list-rules command', async () => {
      const mockInteraction = {
        options: { getSubcommand: () => 'list-rules' },
        guild: { id: 'g' },
        deferred: false,
        replied: false
      } as any;
      
      await service.handleSetup(mockInteraction);
      expect(mockDiscordCommandsService.handleListRules).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle recover-verification command', async () => {
      const mockInteraction = {
        options: { getSubcommand: () => 'recover-verification' },
        guild: { id: 'g' },
        deferred: false,
        replied: false
      } as any;
      
      await service.handleSetup(mockInteraction);
      expect(mockDiscordCommandsService.handleRecoverVerification).toHaveBeenCalledWith(mockInteraction);
    });

    it('should handle setup errors when interaction is not deferred or replied', async () => {
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      const mockInteraction = {
        options: { getSubcommand: () => 'add-rule' },
        guild: { id: 'g' },
        deferred: false,
        replied: false,
        reply: jest.fn().mockResolvedValue({})
      } as any;
      
      mockDiscordCommandsService.handleAddRule.mockRejectedValueOnce(new Error('Test error'));
      
      await service.handleSetup(mockInteraction);
      
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'An error occurred while processing your request.',
        flags: 64 // MessageFlags.Ephemeral
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error in handleSetup:', expect.any(Error));
      loggerErrorSpy.mockRestore();
    });

    it('should handle setup errors when interaction is deferred', async () => {
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      const mockInteraction = {
        options: { getSubcommand: () => 'add-rule' },
        guild: { id: 'g' },
        deferred: true,
        replied: false,
        editReply: jest.fn().mockResolvedValue({})
      } as any;
      
      mockDiscordCommandsService.handleAddRule.mockRejectedValueOnce(new Error('Test error'));
      
      await service.handleSetup(mockInteraction);
      
      expect(mockInteraction.editReply).toHaveBeenCalledWith({
        content: 'An error occurred while processing your request.'
      });
      loggerErrorSpy.mockRestore();
    });

    it('should handle setup errors when reply fails', async () => {
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      const mockInteraction = {
        options: { getSubcommand: () => 'add-rule' },
        guild: { id: 'g' },
        deferred: false,
        replied: false,
        reply: jest.fn().mockRejectedValue(new Error('Reply failed'))
      } as any;
      
      mockDiscordCommandsService.handleAddRule.mockRejectedValueOnce(new Error('Test error'));
      
      await service.handleSetup(mockInteraction);
      
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error in handleSetup:', expect.any(Error));
      expect(loggerErrorSpy).toHaveBeenCalledWith('Failed to send error message to user:', expect.any(Error));
      loggerErrorSpy.mockRestore();
    });
  });

  describe('Service Delegation', () => {
    it('should delegate requestVerification to DiscordVerificationService', async () => {
      const mockInteraction = { customId: 'requestVerification' } as any;
      
      await service.requestVerification(mockInteraction);
      expect(mockDiscordVerificationService.requestVerification).toHaveBeenCalledWith(mockInteraction);
    });

    it('should delegate addUserRole to DiscordVerificationService', async () => {
      await service.addUserRole('userId', 'roleId', 'guildId', 'address', 'nonce');
      expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('userId', 'roleId', 'guildId', 'address', 'nonce');
    });

    it('should delegate throwError to DiscordVerificationService', async () => {
      await service.throwError('nonce', 'error message');
      expect(mockDiscordVerificationService.throwError).toHaveBeenCalledWith('nonce', 'error message');
    });

    it('should delegate getVerificationRoleId to DiscordVerificationService', async () => {
      await service.getVerificationRoleId('guildId', 'channelId', 'messageId');
      expect(mockDiscordVerificationService.getVerificationRoleId).toHaveBeenCalledWith('guildId', 'channelId', 'messageId');
    });

    it('should delegate findExistingVerificationMessage to DiscordMessageService', async () => {
      const mockChannel = { id: 'channelId' } as any;
      await service.findExistingVerificationMessage(mockChannel);
      expect(mockDiscordMessageService.findExistingVerificationMessage).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe('Role Autocomplete', () => {
    it('should filter roles by focused value and bot permissions', async () => {
      const role1 = { id: 'role1', name: 'admin', position: 5, editable: true };
      const role2 = { id: 'role2', name: 'moderator', position: 3, editable: true };
      
      const mockGuildWithRoles = {
        members: { me: { roles: { highest: { position: 10 } } } },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue([role1, role2]),
            find: jest.fn().mockReturnValue(undefined)
          }
        }
      };

      const mockInteraction = {
        guild: mockGuildWithRoles,
        options: {
          getFocused: jest.fn().mockReturnValue('mod')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([
        { name: 'admin', value: 'admin' },
        { name: 'moderator', value: 'moderator' },
        { name: '💡 Create new role: "mod"', value: 'mod' }
      ]);
    });

    it('should not suggest creating new role when role already exists', async () => {
      const existingRole = {
        id: 'existing-role-id',
        name: 'poop',
        position: 1,
        editable: true
      };

      const mockGuild = {
        members: { me: { roles: { highest: { position: 5 } } } },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue([existingRole]),
            find: jest.fn().mockReturnValue(existingRole)
          }
        }
      };

      const mockInteraction = {
        guild: mockGuild,
        options: {
          getFocused: jest.fn().mockReturnValue('poop')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([
        { name: 'poop', value: 'poop' }
      ]);
    });

    it('should suggest creating new role when role does not exist', async () => {
      const mockGuild = {
        members: { me: { roles: { highest: { position: 5 } } } },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue([]),
            find: jest.fn().mockReturnValue(undefined)
          }
        }
      };

      const mockInteraction = {
        guild: mockGuild,
        options: {
          getFocused: jest.fn().mockReturnValue('unique-role-name')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([
        { name: '💡 Create new role: "unique-role-name"', value: 'unique-role-name' }
      ]);
    });

    it('should handle no guild in interaction', async () => {
      const mockInteraction = {
        guild: null,
        options: {
          getFocused: jest.fn().mockReturnValue('test-role')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([]);
    });

    it('should handle no bot member in guild', async () => {
      const mockGuild = {
        members: { me: null },
        roles: { cache: new Map() }
      };

      const mockInteraction = {
        guild: mockGuild,
        options: {
          getFocused: jest.fn().mockReturnValue('test-role')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([]);
    });

    it('should handle autocomplete errors gracefully', async () => {
      const loggerErrorSpy = jest.spyOn(Logger, 'error').mockImplementation();
      const mockInteraction = {
        guild: { members: { me: null } },
        options: {
          getFocused: jest.fn().mockImplementation(() => {
            throw new Error('Autocomplete error');
          })
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([]);
      expect(loggerErrorSpy).toHaveBeenCalledWith('Error in handleRoleAutocomplete:', expect.any(Error));
      loggerErrorSpy.mockRestore();
    });

    it('should limit autocomplete choices to 24 roles plus create option', async () => {
      const roles = Array.from({ length: 30 }, (_, i) => ({
        id: `role${i}`,
        name: `role${i}`,
        position: i + 1,
        editable: true
      }));

      const mockGuild = {
        members: { me: { roles: { highest: { position: 50 } } } },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue(roles.slice(0, 24)),
            find: jest.fn().mockReturnValue(undefined)
          }
        }
      };

      const mockInteraction = {
        guild: mockGuild,
        options: {
          getFocused: jest.fn().mockReturnValue('role')
        },
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      const expectedChoices = [
        ...roles.slice(0, 24).map(role => ({ name: role.name, value: role.name })),
        { name: '💡 Create new role: "role"', value: 'role' }
      ];

      expect(mockInteraction.respond).toHaveBeenCalledWith(expectedChoices);
      expect(expectedChoices.length).toBe(25);
    });
  });

  describe('Event Handling', () => {
    it('should handle interaction create events for autocomplete', async () => {
      let interactionCallback: Function;
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'interactionCreate') {
          interactionCallback = callback;
        }
      });

      await service.createSlashCommands();

      const autocompleteInteraction = {
        isAutocomplete: () => true,
        isChatInputCommand: () => false,
        isButton: () => false,
        commandName: 'setup',
        options: {
          getSubcommand: () => 'add-rule',
          getFocused: jest.fn().mockReturnValue({ name: 'role' })
        }
      };

      const handleRoleAutocompleteSpy = jest.spyOn(service, 'handleRoleAutocomplete').mockResolvedValue();
      
      if (interactionCallback) {
        await interactionCallback(autocompleteInteraction);
      }

      expect(handleRoleAutocompleteSpy).toHaveBeenCalledWith(autocompleteInteraction);
      handleRoleAutocompleteSpy.mockRestore();
    });

    it('should handle interaction create events for chat input commands', async () => {
      let interactionCallback: Function;
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'interactionCreate') {
          interactionCallback = callback;
        }
      });

      await service.createSlashCommands();

      const commandInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        isButton: () => false,
        commandName: 'setup'
      };

      const handleSetupSpy = jest.spyOn(service, 'handleSetup').mockResolvedValue();
      
      if (interactionCallback) {
        await interactionCallback(commandInteraction);
      }

      expect(handleSetupSpy).toHaveBeenCalledWith(commandInteraction);
      handleSetupSpy.mockRestore();
    });

    it('should handle interaction create events for button interactions', async () => {
      let interactionCallback: Function;
      mockClient.on.mockImplementation((event, callback) => {
        if (event === 'interactionCreate') {
          interactionCallback = callback;
        }
      });

      await service.createSlashCommands();

      const buttonInteraction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isButton: () => true,
        customId: 'requestVerification'
      };

      // Mock the handleVerificationRequest method that's now called instead
      const handleVerificationRequestSpy = jest.spyOn(service, 'handleVerificationRequest').mockResolvedValue();

      if (interactionCallback) {
        await interactionCallback(buttonInteraction);
      }

      expect(handleVerificationRequestSpy).toHaveBeenCalledWith(buttonInteraction);
      handleVerificationRequestSpy.mockRestore();
    });
  });
});
