import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../src/services/wallet.service';
import { NonceService } from '../src/services/nonce.service';

const mockNonceService = {
  validateNonce: jest.fn(),
};

const validDecodedData = {
  address: '0xabc',
  userId: 'u',
  userTag: 'tag',
  avatar: 'avatar',
  discordId: 'd',
  discordName: 'dn',
  discordIcon: 'icon',
  role: 'r',
  roleName: 'rn',
  nonce: 'n',
  expiry: Date.now() / 1000,
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
    await expect(service.verifySignature({ ...validDecodedData }, 'sig')).rejects.toThrow('Invalid or expired nonce.');
  });

  it('throws if verification is expired', async () => {
    mockNonceService.validateNonce.mockResolvedValue(true);
    const expired = Math.floor(Date.now() / 1000) - 1000;
    await expect(service.verifySignature({ ...validDecodedData, expiry: expired }, 'sig')).rejects.toThrow('Verification has expired.');
  });

  // You can add more tests for signature logic if you mock viem/recoverTypedDataAddress
});
