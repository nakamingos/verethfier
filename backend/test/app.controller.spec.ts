import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { VerifyService } from '../src/services/verify.service';

const mockVerifyService = {
  verifySignatureFlow: jest.fn(),
};

describe('AppController', () => {
  let controller: AppController;

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

  it('delegates to verifySvc.verifySignatureFlow', async () => {
    mockVerifyService.verifySignatureFlow.mockResolvedValue({ message: 'ok' });
    const body = {
      data: { userId: 'u', nonce: 'n', expiry: Date.now() / 1000 },
      signature: 'sig',
    };
    await controller.verify(body as any);
    expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(body.data, body.signature);
  });
});
