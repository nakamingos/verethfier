import { Test, TestingModule } from '@nestjs/testing';
import { VerifyService } from '../src/services/verify.service';
import { WalletService } from '../src/services/wallet.service';
import { NonceService } from '../src/services/nonce.service';
import { DiscordService } from '../src/services/discord.service';
import { DiscordVerificationService } from '../src/services/discord-verification.service';
import { DataService } from '../src/services/data.service';
import { DbService } from '../src/services/db.service';

const mockWalletService = { verifySignature: jest.fn() };
const mockNonceService = { 
  invalidateNonce: jest.fn(),
  getNonceData: jest.fn().mockResolvedValue({ messageId: 'msg-id', channelId: 'ch-id' })
};
const mockDiscordService = {
  addUserRole: jest.fn(),
  throwError: jest.fn()
};
const mockDiscordVerificationService = {
  addUserRole: jest.fn(),
  throwError: jest.fn(),
  getVerificationRoleId: jest.fn().mockResolvedValue('role-id')
};
const mockDataService = { 
  getDetailedAssets: jest.fn(),
  checkAssetOwnership: jest.fn().mockResolvedValue(1),
  checkAssetOwnershipWithCriteria: jest.fn().mockResolvedValue(1)
};
const mockDbService = {
  getServerRole: jest.fn(),
  logUserRole: jest.fn(),
  getRoleMappings: jest.fn(),
  findRuleByMessageId: jest.fn().mockResolvedValue({ 
    id: 1, 
    role_id: 'role-id', 
    slug: 'test-collection',
    attribute_key: null,
    attribute_value: null,
    min_items: 1
  })
};

describe('VerifyService', () => {
  let service: VerifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyService,
        { provide: WalletService, useValue: mockWalletService },
        { provide: NonceService, useValue: mockNonceService },
        { provide: DiscordService, useValue: mockDiscordService },
        { provide: DiscordVerificationService, useValue: mockDiscordVerificationService },
        { provide: DataService, useValue: mockDataService },
        { provide: DbService, useValue: mockDbService },
      ],
    }).compile();
    service = module.get<VerifyService>(VerifyService);
    jest.clearAllMocks();
  });

  it('handles legacy path', async () => {
    // Mock empty nonce data to trigger legacy path
    mockNonceService.getNonceData.mockResolvedValue({ messageId: null, channelId: null });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    mockDbService.getServerRole.mockResolvedValue('123');
    const payload = { userId: 'u', discordId: 'g', role: 'legacy', nonce: 'n' };
    await service.verifySignatureFlow(payload as any, 'sig');
    expect(mockWalletService.verifySignature).toHaveBeenCalled();
    expect(mockDbService.getServerRole).toHaveBeenCalledWith('g');
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalled();
    expect(mockDbService.logUserRole).toHaveBeenCalled();
  });

  it('handles multi-rule path', async () => {
    // Mock empty nonce data to trigger multi-rule path
    mockNonceService.getNonceData.mockResolvedValue({ messageId: null, channelId: null });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    mockDbService.getRoleMappings.mockResolvedValue([
      { id: 1, slug: null, channel_id: null, attribute_key: null, attribute_value: null, min_items: null, role_id: 'r1' },
      { id: 2, slug: 'ALL', channel_id: null, attribute_key: null, attribute_value: null, min_items: null, role_id: 'r2' },
    ]);
    mockDataService.getDetailedAssets.mockResolvedValue([{ slug: 'foo', attributes: {} }]);
    const payload = { userId: 'u', discordId: 'g', nonce: 'n' };
    await service.verifySignatureFlow(payload as any, 'sig');
    expect(mockDbService.getRoleMappings).toHaveBeenCalled();
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledTimes(2);
    expect(mockDbService.logUserRole).toHaveBeenCalledTimes(2);
  });

  it('throws error if no match', async () => {
    // Mock empty nonce data to trigger multi-rule path, but no matching assets
    mockNonceService.getNonceData.mockResolvedValue({ messageId: null, channelId: null });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    mockDbService.getRoleMappings.mockResolvedValue([]);
    mockDataService.getDetailedAssets.mockResolvedValue([]);
    const payload = { userId: 'u', discordId: 'g', nonce: 'n' };
    await expect(service.verifySignatureFlow(payload as any, 'sig')).rejects.toThrow('Address does not own any assets in the collection');
    expect(mockDiscordVerificationService.throwError).toHaveBeenCalled();
  });
});
