import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { VerifyService } from '../src/services/verify.service';

describe('AppController', () => {
  let controller: AppController;
  const mockVerifyService = { verifySignatureFlow: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: VerifyService, useValue: mockVerifyService },
      ],
    }).compile();
    controller = module.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('verify', () => {
    it('delegates to verifySvc.verifySignatureFlow', async () => {
      mockVerifyService.verifySignatureFlow.mockResolvedValue({ message: 'ok' });
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      const result = await controller.verify(body as any);
      
      // The controller now transforms the data to match the expected interface
      const expectedData = {
        address: '',
        userId: 'u',
        userTag: '',
        avatar: '',
        discordId: '',
        discordName: '',
        discordIcon: '',
        nonce: 'n',
        expiry: body.data.expiry,
      };
      
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(expectedData, body.signature);
      expect(result).toEqual({ message: 'ok' });
    });

    it('throws HttpException when VerifyService throws', async () => {
      const errorMessage = 'Verification failed';
      mockVerifyService.verifySignatureFlow.mockRejectedValue(new Error(errorMessage));
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      await expect(controller.verify(body as any)).rejects.toThrow('Verification failed. Please try again.');
    });

    it('throws HttpException when error has no message', async () => {
      mockVerifyService.verifySignatureFlow.mockRejectedValue(new Error());
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      await expect(controller.verify(body as any)).rejects.toThrow('Verification failed. Please try again.');
    });

    it('throws HttpException when error is not an Error object', async () => {
      mockVerifyService.verifySignatureFlow.mockRejectedValue('string error');
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      await expect(controller.verify(body as any)).rejects.toThrow('Verification failed. Please try again.');
    });

    it('handles successful verification with address', async () => {
      const mockResult = { 
        message: 'Verification successful', 
        address: '0xabc123',
        assignedRoles: ['role1', 'role2']
      };
      mockVerifyService.verifySignatureFlow.mockResolvedValue(mockResult);
      const body = {
        data: { 
          userId: 'user123', 
          nonce: 'nonce123', 
          expiry: Date.now() / 1000 + 3600,
          address: '0xabc123'
        },
        signature: 'valid_signature',
      };
      
      const result = await controller.verify(body as any);
      
      expect(result).toEqual(mockResult);
    });

    it('handles verify request with complete data payload', async () => {
      const mockResult = { message: 'ok' };
      mockVerifyService.verifySignatureFlow.mockResolvedValue(mockResult);
      const completeData = {
        userId: 'user123',
        userTag: 'User#1234',
        avatar: 'avatar_url',
        discordId: 'guild123',
        discordName: 'Test Guild',
        discordIconURL: 'icon_url',
        nonce: 'nonce123',
        expiry: Date.now() / 1000 + 3600,
        address: '0xabc123'
      };
      const body = {
        data: completeData,
        signature: 'valid_signature',
      };
      
      const expectedTransformed = {
        userId: 'user123',
        userTag: 'User#1234',
        avatar: 'avatar_url',
        discordId: 'guild123',
        discordName: 'Test Guild',
        discordIcon: 'icon_url',
        nonce: 'nonce123',
        expiry: completeData.expiry,
        address: '0xabc123'
      };
      
      await controller.verify(body as any);
      
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(expectedTransformed, 'valid_signature');
    });
  });
});
