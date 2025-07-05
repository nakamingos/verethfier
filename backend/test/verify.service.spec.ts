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
    attribute_key: '',
    attribute_value: '',
    min_items: 1
  }),
  findRulesByMessageId: jest.fn().mockResolvedValue([])
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
      { id: 1, slug: 'ALL', channel_id: null, attribute_key: '', attribute_value: '', min_items: 0, role_id: 'r1' },
      { id: 2, slug: 'ALL', channel_id: null, attribute_key: '', attribute_value: '', min_items: 0, role_id: 'r2' },
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

  it('handles rule with min_items=0 correctly', async () => {
    const mockPayload = {
      userId: 'user123',
      discordId: 'guild123',
      nonce: 'nonce123',
      address: '0x123...abc',
      userTag: 'TestUser#1234',
      avatar: 'avatar.png',
      discordName: 'TestUser',
      discordIcon: 'guild-icon.png',
      role: 'role123',
      roleName: 'Test Role',
      expiry: Date.now() + 3600000
    };
    const mockSignature = 'signature123';
    const mockAddress = '0x123...abc';
    const mockMessageId = 'message123';
    const mockChannelId = 'channel123';

    // Mock the wallet verification
    jest.spyOn(service['walletSvc'], 'verifySignature').mockResolvedValue(mockAddress);
    
    // Mock nonce service
    jest.spyOn(service['nonceSvc'], 'getNonceData').mockResolvedValue({
      messageId: mockMessageId,
      channelId: mockChannelId
    });
    jest.spyOn(service['nonceSvc'], 'invalidateNonce').mockResolvedValue();

    // Mock a rule with min_items=0
    const mockRules = [{
      id: 1,
      role_id: 'role123',
      slug: 'test-collection',
      attribute_key: null,
      attribute_value: null,
      min_items: 0,  // This should allow assignment even with 0 assets
      server_id: 'guild123',
      server_name: 'TestGuild',
      channel_id: 'channel123',
      channel_name: 'test-channel',
      message_id: mockMessageId
    }];
    jest.spyOn(service['dbSvc'], 'findRulesByMessageId').mockResolvedValue(mockRules);

    // Mock data service returning 0 matching assets
    jest.spyOn(service['dataSvc'], 'checkAssetOwnershipWithCriteria').mockResolvedValue(0);

    // Mock Discord verification service
    jest.spyOn(service['discordVerificationSvc'], 'addUserRole').mockResolvedValue();
    jest.spyOn(service['dbSvc'], 'logUserRole').mockResolvedValue();

    const result = await service.verifySignatureFlow(mockPayload, mockSignature);

    // Should succeed even with 0 assets because min_items=0
    expect(result.message).toContain('Verification successful');
    expect(result.assignedRoles).toEqual(['role123']);
    expect(service['discordVerificationSvc'].addUserRole).toHaveBeenCalledWith(
      'user123',
      'role123',
      'guild123',
      mockAddress,
      'nonce123'
    );
  });
});
