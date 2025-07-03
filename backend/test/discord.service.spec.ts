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
  getRoleMappings: jest.fn()
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
});
