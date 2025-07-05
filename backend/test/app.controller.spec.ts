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
      
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(body.data, body.signature);
      expect(result).toEqual({ message: 'ok' });
    });

    it('returns error object when VerifyService throws', async () => {
      const errorMessage = 'Verification failed';
      mockVerifyService.verifySignatureFlow.mockRejectedValue(new Error(errorMessage));
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      const result = await controller.verify(body as any);
      
      expect(result).toEqual({ error: errorMessage });
    });

    it('returns generic error message when error has no message', async () => {
      mockVerifyService.verifySignatureFlow.mockRejectedValue(new Error());
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      const result = await controller.verify(body as any);
      
      expect(result).toEqual({ error: 'An error occurred during verification' });
    });

    it('returns generic error message when error is not an Error object', async () => {
      mockVerifyService.verifySignatureFlow.mockRejectedValue('string error');
      const body = {
        data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
        signature: 'sig',
      };
      
      const result = await controller.verify(body as any);
      
      expect(result).toEqual({ error: 'An error occurred during verification' });
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
        discordIcon: 'icon_url',
        role: 'role123',
        roleName: 'Test Role',
        nonce: 'nonce123',
        expiry: Date.now() / 1000 + 3600,
        address: '0xabc123'
      };
      const body = {
        data: completeData,
        signature: 'valid_signature',
      };
      
      await controller.verify(body as any);
      
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(completeData, 'valid_signature');
    });
  });
});
