import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../src/services/wallet.service';
import { NonceService } from '../src/services/nonce.service';
import { DecodedData } from '../src/models/app.interface';

const mockNonceService = {
  validateNonce: jest.fn(),
};

const baseData: DecodedData = {
  address: '0xabc',
  userId: 'u',
  userTag: 'tag',
  avatar: '',
  discordId: 'd',
  discordName: 'dn',
  discordIcon: '',
  role: 'r',
  roleName: 'rn',
  nonce: 'n',
  expiry: Math.floor(Date.now() / 1000) + 1000,
};

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: NonceService, useValue: mockNonceService },
      ],
    }).compile();
    service = module.get<WalletService>(WalletService);
    jest.clearAllMocks();
  });

  it('throws if nonce is invalid', async () => {
    mockNonceService.validateNonce.mockResolvedValue(false);
    await expect(service.verifySignature({ ...baseData }, 'sig'))
      .rejects.toThrow('Invalid or expired nonce.');
  });

  it('throws if verification is expired', async () => {
    mockNonceService.validateNonce.mockResolvedValue(true);
    const expiredData = { ...baseData, expiry: Math.floor(Date.now() / 1000) - 1000 };
    await expect(service.verifySignature(expiredData, 'sig'))
      .rejects.toThrow('Verification has expired.');
  });
});
