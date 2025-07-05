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

  it('handles message-based verification with single rule', async () => {
    // Mock nonce data with messageId and channelId to trigger message-based path
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [{
      id: 1,
      role_id: 'role-123',
      slug: 'test-collection',
      attribute_key: 'trait',
      attribute_value: 'rare',
      min_items: 1
    }];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(2); // User owns 2 matching assets
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    const result = await service.verifySignatureFlow(payload as any, 'sig');
    
    expect(mockDbService.findRulesByMessageId).toHaveBeenCalledWith('guild123', 'ch-456', 'msg-123');
    expect(mockDataService.checkAssetOwnershipWithCriteria).toHaveBeenCalledWith('0xabc', 'test-collection', 'trait', 'rare', 1);
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('user123', 'role-123', 'guild123', '0xabc', 'nonce123');
    expect(mockDbService.logUserRole).toHaveBeenCalledWith('user123', 'guild123', 'role-123', '0xabc');
    expect(result.message).toContain('message-based');
    expect(result.assignedRoles).toEqual(['role-123']);
  });

  it('handles message-based verification with multiple rules', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [
      {
        id: 1,
        role_id: 'role-123',
        slug: 'collection1',
        attribute_key: null,
        attribute_value: null,
        min_items: 1
      },
      {
        id: 2,
        role_id: 'role-456',
        slug: 'collection2',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 2
      }
    ];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria
      .mockResolvedValueOnce(5) // User owns 5 of collection1
      .mockResolvedValueOnce(3); // User owns 3 matching collection2 with trait=rare
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    const result = await service.verifySignatureFlow(payload as any, 'sig');
    
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledTimes(2);
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('user123', 'role-123', 'guild123', '0xabc', 'nonce123');
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('user123', 'role-456', 'guild123', '0xabc', 'nonce123');
    expect(result.assignedRoles).toEqual(['role-123', 'role-456']);
  });

  it('handles message-based verification when no rules found', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    mockDbService.findRulesByMessageId.mockResolvedValue([]);
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    await expect(service.verifySignatureFlow(payload as any, 'sig'))
      .rejects.toThrow('No verification rules found for this request');
    
    expect(mockDiscordVerificationService.throwError).toHaveBeenCalledWith('nonce123', 'No verification rules found for this request');
  });

  it('handles message-based verification when user does not meet criteria', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [{
      id: 1,
      role_id: 'role-123',
      slug: 'test-collection',
      attribute_key: null,
      attribute_value: null,
      min_items: 1
    }];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(0); // User owns 0 assets
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    await expect(service.verifySignatureFlow(payload as any, 'sig'))
      .rejects.toThrow('Address does not own the required assets for collection: test-collection');
    
    expect(mockDiscordVerificationService.throwError).toHaveBeenCalledWith('nonce123', 'Address does not own the required assets for collection: test-collection');
    expect(mockDiscordVerificationService.addUserRole).not.toHaveBeenCalled();
  });

  it('handles message-based verification with some rules failing', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [
      {
        id: 1,
        role_id: 'role-123',
        slug: 'collection1',
        attribute_key: null,
        attribute_value: null,
        min_items: 1
      },
      {
        id: 2,
        role_id: 'role-456',
        slug: 'collection2',
        attribute_key: 'trait',
        attribute_value: 'rare',
        min_items: 5 // User doesn't have enough
      }
    ];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria
      .mockResolvedValueOnce(3) // User owns 3 of collection1 (meets requirement)
      .mockResolvedValueOnce(2); // User owns 2 matching collection2 (doesn't meet min_items=5)
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    const result = await service.verifySignatureFlow(payload as any, 'sig');
    
    // Should only assign the first role
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledTimes(1);
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('user123', 'role-123', 'guild123', '0xabc', 'nonce123');
    expect(result.assignedRoles).toEqual(['role-123']);
  });

  it('handles message-based verification with role assignment error', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [{
      id: 1,
      role_id: 'role-123',
      slug: 'test-collection',
      attribute_key: null,
      attribute_value: null,
      min_items: 1
    }];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(1);
    mockDiscordVerificationService.addUserRole.mockRejectedValue(new Error('Discord error'));
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    // Should still complete and return success even if one role assignment fails
    const result = await service.verifySignatureFlow(payload as any, 'sig');
    expect(result.message).toContain('message-based');
    expect(result.assignedRoles).toEqual([]);
  });

  it('handles message-based verification with null role_id', async () => {
    mockNonceService.getNonceData.mockResolvedValue({ 
      messageId: 'msg-123', 
      channelId: 'ch-456' 
    });
    mockWalletService.verifySignature.mockResolvedValue('0xabc');
    
    const mockRules = [
      {
        id: 1,
        role_id: null, // This should be skipped
        slug: 'collection1',
        attribute_key: null,
        attribute_value: null,
        min_items: 1
      },
      {
        id: 2,
        role_id: 'role-456',
        slug: 'collection2',
        attribute_key: null,
        attribute_value: null,
        min_items: 1
      }
    ];
    
    mockDbService.findRulesByMessageId.mockResolvedValue(mockRules);
    mockDataService.checkAssetOwnershipWithCriteria.mockResolvedValue(1);
    mockDiscordVerificationService.addUserRole.mockResolvedValue(undefined); // Ensure it succeeds
    
    const payload = { 
      userId: 'user123', 
      discordId: 'guild123', 
      nonce: 'nonce123' 
    };
    
    const result = await service.verifySignatureFlow(payload as any, 'sig');
    
    // Should only process the second rule
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledTimes(1);
    expect(mockDiscordVerificationService.addUserRole).toHaveBeenCalledWith('user123', 'role-456', 'guild123', '0xabc', 'nonce123');
    expect(result.assignedRoles).toEqual(['role-456']);
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
      role_name: 'Test Role',
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
