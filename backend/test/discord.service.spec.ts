import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../src/services/discord.service';
import { DiscordMessageService } from '../src/services/discord-message.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';
import { DiscordCommandsService } from '../src/services/discord-commands.service';
import { DbService } from '../src/services/db.service';
import { NonceService } from '../src/services/nonce.service';

jest.mock('discord.js', () => {
  const actual = jest.requireActual('discord.js');
  return {
    ...actual,
    REST: jest.fn().mockImplementation(() => ({
      setToken: jest.fn().mockReturnThis(),
    })),
    Client: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      login: jest.fn(),
      guilds: { cache: new Map() },
      user: {},
    })),
    ClientUser: jest.fn(),
    // Add more mocks as needed
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
  handleRemoveLegacyRule: jest.fn(),
  handleMigrateLegacyRule: jest.fn(),
};

describe('DiscordService', () => {
  let service: DiscordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        { provide: NonceService, useValue: mockNonceService },
        { provide: DbService, useValue: mockDbService },
        { provide: DiscordMessageService, useValue: mockDiscordMessageService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
        { provide: DiscordCommandsService, useValue: mockDiscordCommandsService },
      ],
    }).compile();
    service = module.get<DiscordService>(DiscordService);
    jest.clearAllMocks();
  });

  it('add-rule delegates to DiscordCommandsService', async () => {
    const mockInteraction = {
      options: { getSubcommand: () => 'add-rule' },
      guild: { id: 'g' },
      isChatInputCommand: () => true,
      isButton: () => false,
    } as any;
    
    await service.handleSetup(mockInteraction);
    expect(mockDiscordCommandsService.handleAddRule).toHaveBeenCalledWith(mockInteraction);
  });

  it('remove-rule delegates to DiscordCommandsService', async () => {
    const mockInteraction = {
      options: { getSubcommand: () => 'remove-rule' },
      guild: { id: 'g' },
      isChatInputCommand: () => true,
      isButton: () => false,
    } as any;
    
    await service.handleSetup(mockInteraction);
    expect(mockDiscordCommandsService.handleRemoveRule).toHaveBeenCalledWith(mockInteraction);
  });

  it('list-rules delegates to DiscordCommandsService', async () => {
    const mockInteraction = {
      options: { getSubcommand: () => 'list-rules' },
      guild: { id: 'g' },
      isChatInputCommand: () => true,
      isButton: () => false,
    } as any;
    
    await service.handleSetup(mockInteraction);
    expect(mockDiscordCommandsService.handleListRules).toHaveBeenCalledWith(mockInteraction);
  });

  it('requestVerification delegates to DiscordVerificationService', async () => {
    const mockInteraction = {
      customId: 'requestVerification',
      guild: { id: 'g' },
      isChatInputCommand: () => false,
      isButton: () => true,
    } as any;
    
    await service.requestVerification(mockInteraction);
    expect(mockDiscordVerificationService.requestVerification).toHaveBeenCalledWith(mockInteraction);
  });

  it('addUserRole delegates to DiscordVerificationService', async () => {
    await service.addUserRole('userId', 'roleId', 'guildId', 'address', 'nonce');
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('userId', 'roleId', 'guildId', 'address', 'nonce');
  });

  it('throwError delegates to DiscordVerificationService', async () => {
    await service.throwError('nonce', 'error message');
    expect(mockDiscordVerificationService.throwError).toHaveBeenCalledWith('nonce', 'error message');
  });

  it('findExistingVerificationMessage delegates to DiscordMessageService', async () => {
    const mockChannel = { id: 'channelId' } as any;
    await service.findExistingVerificationMessage(mockChannel);
    expect(mockDiscordMessageService.findExistingVerificationMessage).toHaveBeenCalledWith(mockChannel);
  });

  describe('handleRoleAutocomplete', () => {
    it('should not suggest creating new role when role already exists', async () => {
      const existingRole = {
        id: 'existing-role-id',
        name: 'poop',
        position: 1,
        editable: true
      };

      const botMember = {
        roles: {
          highest: { position: 5 }
        }
      };

      const mockGuild = {
        members: { me: botMember },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue([existingRole]),
            find: jest.fn().mockReturnValue(existingRole) // Found existing role
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
      ]); // Should only show existing role, no "Create new role" option
    });

    it('should suggest creating new role when role does not exist', async () => {
      const botMember = {
        roles: {
          highest: { position: 5 }
        }
      };

      const mockGuild = {
        members: { me: botMember },
        roles: {
          cache: {
            filter: jest.fn().mockReturnThis(),
            sort: jest.fn().mockReturnThis(),
            first: jest.fn().mockReturnValue([]), // No matching roles found
            find: jest.fn().mockReturnValue(undefined) // No existing role with this name
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
      ]); // Should show "Create new role" option
    });

    it('should handle errors gracefully', async () => {
      const mockInteraction = {
        guild: null, // This will cause an early return
        respond: jest.fn()
      };

      await service.handleRoleAutocomplete(mockInteraction);

      expect(mockInteraction.respond).toHaveBeenCalledWith([]);
    });
  });
});
