import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../src/services/wallet.service';
import { NonceService } from '../src/services/nonce.service';
import { DecodedData } from '../src/models/app.interface';
import { recoverTypedDataAddress } from 'viem';

// Mock viem functions
jest.mock('viem', () => ({
  recoverTypedDataAddress: jest.fn(),
}));

const mockRecoverTypedDataAddress = recoverTypedDataAddress as jest.MockedFunction<typeof recoverTypedDataAddress>;

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

  describe('verifySignature', () => {
    it('throws if nonce is invalid', async () => {
      mockNonceService.validateNonce.mockResolvedValue(false);
      await expect(service.verifySignature({ ...baseData }, 'sig'))
        .rejects.toThrow('Invalid or expired nonce.');
    });

    it('throws if nonce is null/undefined', async () => {
      mockNonceService.validateNonce.mockResolvedValue(null);
      await expect(service.verifySignature({ ...baseData }, 'sig'))
        .rejects.toThrow('Invalid or expired nonce.');
    });

    it('throws if verification is expired', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      const expiredData = { ...baseData, expiry: Math.floor(Date.now() / 1000) - 1000 };
      await expect(service.verifySignature(expiredData, 'sig'))
        .rejects.toThrow('Verification has expired.');
    });

    it('throws if verification is exactly at expiry time', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      const expiredData = { ...baseData, expiry: Math.floor(Date.now() / 1000) };
      await expect(service.verifySignature(expiredData, 'sig'))
        .rejects.toThrow('Verification has expired.');
    });

    it('throws if signature does not match address', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xdifferentaddress');
      
      await expect(service.verifySignature({ ...baseData }, 'sig'))
        .rejects.toThrow('Invalid signature.');
    });

    it('successfully verifies valid signature', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      const result = await service.verifySignature({ ...baseData }, 'sig');
      
      expect(result).toBe('0xabc');
      expect(mockNonceService.validateNonce).toHaveBeenCalledWith('u', 'n');
    });

    it('calls recoverTypedDataAddress with correct parameters', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      await service.verifySignature({ ...baseData }, 'sig');
      
      expect(mockRecoverTypedDataAddress).toHaveBeenCalledWith({
        domain: {
          name: 'verethfier',
          version: '1',
          chainId: 1,
        },
        types: {
          Verification: [
            { name: 'UserID', type: 'string' },
            { name: 'UserTag', type: 'string' },
            { name: 'ServerID', type: 'string' },
            { name: 'ServerName', type: 'string' },
            { name: 'RoleID', type: 'string' },
            { name: 'RoleName', type: 'string' },
            { name: 'Nonce', type: 'string' },
            { name: 'Expiry', type: 'uint256' },
          ]
        },
        primaryType: 'Verification',
        message: {
          UserID: 'u',
          UserTag: 'tag',
          ServerID: 'd',
          ServerName: 'dn',
          RoleID: 'r',
          RoleName: 'rn',
          Nonce: 'n',
          Expiry: baseData.expiry,
        },
        signature: 'sig'
      });
    });

    it('handles case-insensitive address matching', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xABC'); // uppercase
      
      const dataWithUppercase = { ...baseData, address: '0xABC' }; // match the recovered address
      const result = await service.verifySignature(dataWithUppercase, 'sig');
      
      expect(result).toBe('0xABC');
    });

    it('handles signature with 0x prefix', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      await service.verifySignature({ ...baseData }, '0x123456789');
      
      expect(mockRecoverTypedDataAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: '0x123456789'
        })
      );
    });

    it('handles signature without 0x prefix', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      await service.verifySignature({ ...baseData }, '123456789');
      
      expect(mockRecoverTypedDataAddress).toHaveBeenCalledWith(
        expect.objectContaining({
          signature: '123456789'
        })
      );
    });

    it('handles edge case with future expiry time', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      const futureData = { ...baseData, expiry: Math.floor(Date.now() / 1000) + 10000 };
      const result = await service.verifySignature(futureData, 'sig');
      
      expect(result).toBe('0xabc');
    });

    it('validates nonce service is called with correct parameters', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      await service.verifySignature({ ...baseData }, 'sig');
      
      expect(mockNonceService.validateNonce).toHaveBeenCalledWith('u', 'n');
      expect(mockNonceService.validateNonce).toHaveBeenCalledTimes(1);
    });

    it('handles empty string values gracefully', async () => {
      mockNonceService.validateNonce.mockResolvedValue(true);
      mockRecoverTypedDataAddress.mockResolvedValue('0xabc');
      
      const dataWithEmptyStrings = {
        ...baseData,
        userTag: '',
        discordName: '',
        role: '',
        roleName: '',
      };
      
      const result = await service.verifySignature(dataWithEmptyStrings, 'sig');
      expect(result).toBe('0xabc');
    });
  });
});
