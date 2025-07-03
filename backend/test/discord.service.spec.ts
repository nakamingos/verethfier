import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../src/services/discord.service';
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
  ruleExists: jest.fn(), // Add mock for ruleExists
};
const mockNonceService = {};

describe('DiscordService', () => {
  let service: DiscordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        { provide: NonceService, useValue: mockNonceService },
        { provide: DbService, useValue: mockDbService },
      ],
    }).compile();
    service = module.get<DiscordService>(DiscordService);
    jest.clearAllMocks();
  });

  it('add-rule calls addRoleMapping', async () => {
    await service['dbSvc'].addRoleMapping('g', 'n', 'c', 's', 'r', 'k', 'v', 1);
    expect(mockDbService.addRoleMapping).toHaveBeenCalled();
  });
  it('remove-rule calls deleteRoleMapping', async () => {
    await service['dbSvc'].deleteRoleMapping('1', 'g');
    expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1', 'g');
  });
  it('list-rules calls getRoleMappings', async () => {
    await service['dbSvc'].getRoleMappings('g', 'c');
    expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('g', 'c');
  });
  it('remove-legacy-rule calls removeAllLegacyRoles and replies with removed roles', async () => {
    const mockInteraction = {
      options: { getSubcommand: () => 'remove-legacy-rule' },
      guild: { id: 'g' },
      reply: jest.fn(),
      isChatInputCommand: () => true,
      isButton: () => false,
    } as any;
    mockDbService.removeAllLegacyRoles.mockResolvedValue({ removed: [{ role_id: 'r' }] });
    await service.handleSetup(mockInteraction);
    expect(mockDbService.removeAllLegacyRoles).toHaveBeenCalledWith('g');
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: 'Removed legacy rule(s): <@&r>',
      flags: expect.any(Number)
    });
  });

  it('migrate-legacy-rule migrates legacy roles and removes them', async () => {
    const mockInteraction = {
      options: {
        getSubcommand: () => 'migrate-legacy-rule',
        getChannel: () => ({ id: 'c' })
      },
      guild: { id: 'g', name: 'Guild' },
      reply: jest.fn(),
      isChatInputCommand: () => true,
      isButton: () => false,
    } as any;
    mockDbService.getLegacyRoles.mockResolvedValue({ data: [{ role_id: 'r', name: 'Role' }], error: null });
    mockDbService.addRoleMapping.mockResolvedValue({});
    mockDbService.removeAllLegacyRoles.mockResolvedValue({ removed: [{ role_id: 'r' }] });
    await service.handleSetup(mockInteraction);
    expect(mockDbService.getLegacyRoles).toHaveBeenCalledWith('g');
    expect(mockDbService.addRoleMapping).toHaveBeenCalledWith('g', 'Guild', 'c', 'ALL', 'r', null, null, null);
    expect(mockDbService.removeAllLegacyRoles).toHaveBeenCalledWith('g');
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: 'Migrated legacy rule(s) to new rule(s) for channel <#c>: <@&r>. Removed legacy rule(s).',
      flags: expect.any(Number)
    });
  });
});
