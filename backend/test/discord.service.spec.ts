import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../src/services/discord.service';
import { DbService } from '../src/services/db.service';
import { NonceService } from '../src/services/nonce.service';

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
    await service['dbSvc'].deleteRoleMapping('1');
    expect(mockDbService.deleteRoleMapping).toHaveBeenCalledWith('1');
  });
  it('list-rules calls getRoleMappings', async () => {
    await service['dbSvc'].getRoleMappings('g', 'c');
    expect(mockDbService.getRoleMappings).toHaveBeenCalledWith('g', 'c');
  });
});
