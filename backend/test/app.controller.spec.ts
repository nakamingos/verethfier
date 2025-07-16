import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { VerifyService } from '../src/services/verify.service';
import { VerifySignatureDto } from '../src/dtos/verify-signature.dto';
import { DecodedData } from '../src/models/app.interface';

/**
 * AppController Test Suite
 * 
 * Comprehensive tests for the main REST API controller, covering:
 * - Health check endpoint
 * - Info endpoint  
 * - Signature verification endpoint (success and error scenarios)
 * - Input validation and security
 * - Error handling and sanitization
 */
describe('AppController', () => {
  let controller: AppController;
  let appService: AppService;
  let verifyService: VerifyService;

  const mockAppService = {
    getHealth: jest.fn(),
    getInfo: jest.fn(),
  };

  const mockVerifyService = {
    verifySignatureFlow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
        {
          provide: VerifyService,
          useValue: mockVerifyService,
        },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    appService = module.get<AppService>(AppService);
    verifyService = module.get<VerifyService>(VerifyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return health status', () => {
      const expectedHealth = {
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        environment: 'test',
        version: '1.0.0',
      };

      mockAppService.getHealth.mockReturnValue(expectedHealth);

      const result = controller.getHealth();

      expect(result).toEqual(expectedHealth);
      expect(mockAppService.getHealth).toHaveBeenCalledTimes(1);
    });

    it('should delegate to AppService for health check', () => {
      controller.getHealth();
      expect(mockAppService.getHealth).toHaveBeenCalled();
    });
  });

  describe('getInfo', () => {
    it('should return application information', () => {
      const expectedInfo = {
        name: 'Verethfier Backend',
        description: 'NestJS-based Discord bot for Ethscriptions-based role verification',
        architecture: 'Unified verification engine with channel-based verification',
        features: [
          'EIP-712 signature verification',
          'Dynamic role management',
          'High-performance caching',
          'Multi-tier rate limiting',
          'Migration support',
        ],
      };

      mockAppService.getInfo.mockReturnValue(expectedInfo);

      const result = controller.getInfo();

      expect(result).toEqual(expectedInfo);
      expect(mockAppService.getInfo).toHaveBeenCalledTimes(1);
    });

    it('should delegate to AppService for application info', () => {
      controller.getInfo();
      expect(mockAppService.getInfo).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    const validRequestBody: VerifySignatureDto = {
      data: {
        address: '0x1234567890123456789012345678901234567890',
        userId: 'discord-user-123',
        userTag: 'testuser#1234',
        avatar: 'https://cdn.discordapp.com/avatar.png',
        discordId: 'discord-server-456',
        discordName: 'Test Server',
        discordIconURL: 'https://cdn.discordapp.com/server-icon.png',
        nonce: 'test-nonce-789',
        expiry: 1234567890,
      },
      signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    };

    const expectedDecodedData: DecodedData = {
      address: '0x1234567890123456789012345678901234567890',
      userId: 'discord-user-123',
      userTag: 'testuser#1234',
      avatar: 'https://cdn.discordapp.com/avatar.png',
      discordId: 'discord-server-456',
      discordName: 'Test Server',
      discordIcon: 'https://cdn.discordapp.com/server-icon.png',
      nonce: 'test-nonce-789',
      expiry: 1234567890,
    };

    it('should successfully verify a valid signature', async () => {
      const expectedResult = {
        message: 'Verification successful',
        address: '0x1234567890123456789012345678901234567890',
        assignedRoles: ['verified-user'],
      };

      mockVerifyService.verifySignatureFlow.mockResolvedValue(expectedResult);

      const result = await controller.verify(validRequestBody);

      expect(result).toEqual(expectedResult);
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
        expectedDecodedData,
        validRequestBody.signature
      );
    });

    it('should handle missing optional fields gracefully', async () => {
      const requestWithMissingFields: VerifySignatureDto = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
        },
        signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const expectedDecodedDataWithDefaults: DecodedData = {
        address: '0x1234567890123456789012345678901234567890',
        userId: '',
        userTag: '',
        avatar: '',
        discordId: '',
        discordName: '',
        discordIcon: '',
        nonce: '',
        expiry: 0,
      };

      const expectedResult = {
        message: 'Verification successful',
        address: '0x1234567890123456789012345678901234567890',
        assignedRoles: [],
      };

      mockVerifyService.verifySignatureFlow.mockResolvedValue(expectedResult);

      const result = await controller.verify(requestWithMissingFields);

      expect(result).toEqual(expectedResult);
      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
        expectedDecodedDataWithDefaults,
        requestWithMissingFields.signature
      );
    });

    it('should handle discordIcon field mapping correctly', async () => {
      const requestWithDiscordIcon: VerifySignatureDto = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
          discordIcon: 'https://cdn.discordapp.com/icon-alt.png',
        },
        signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const expectedDecodedData: DecodedData = {
        address: '0x1234567890123456789012345678901234567890',
        userId: '',
        userTag: '',
        avatar: '',
        discordId: '',
        discordName: '',
        discordIcon: 'https://cdn.discordapp.com/icon-alt.png',
        nonce: '',
        expiry: 0,
      };

      mockVerifyService.verifySignatureFlow.mockResolvedValue({
        message: 'Verification successful',
        address: '0x1234567890123456789012345678901234567890',
        assignedRoles: [],
      });

      await controller.verify(requestWithDiscordIcon);

      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
        expectedDecodedData,
        requestWithDiscordIcon.signature
      );
    });

    it('should prioritize discordIconURL over discordIcon', async () => {
      const requestWithBothIconFields: VerifySignatureDto = {
        data: {
          address: '0x1234567890123456789012345678901234567890',
          discordIconURL: 'https://cdn.discordapp.com/primary-icon.png',
          discordIcon: 'https://cdn.discordapp.com/fallback-icon.png',
        },
        signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const expectedDecodedData: DecodedData = {
        address: '0x1234567890123456789012345678901234567890',
        userId: '',
        userTag: '',
        avatar: '',
        discordId: '',
        discordName: '',
        discordIcon: 'https://cdn.discordapp.com/primary-icon.png',
        nonce: '',
        expiry: 0,
      };

      mockVerifyService.verifySignatureFlow.mockResolvedValue({
        message: 'Verification successful',
        address: '0x1234567890123456789012345678901234567890',
        assignedRoles: [],
      });

      await controller.verify(requestWithBothIconFields);

      expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
        expectedDecodedData,
        requestWithBothIconFields.signature
      );
    });

    describe('error handling', () => {
      it('should preserve HttpException status codes', async () => {
        const httpError = new HttpException('Invalid signature', HttpStatus.BAD_REQUEST);
        mockVerifyService.verifySignatureFlow.mockRejectedValue(httpError);

        await expect(controller.verify(validRequestBody)).rejects.toThrow(
          new HttpException('Invalid signature', HttpStatus.BAD_REQUEST)
        );
      });

      it('should convert generic errors to 500 status with sanitized message', async () => {
        const genericError = new Error('Database connection failed with secret info');
        mockVerifyService.verifySignatureFlow.mockRejectedValue(genericError);

        await expect(controller.verify(validRequestBody)).rejects.toThrow(
          new HttpException('Verification failed. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      });

      it('should handle null/undefined errors gracefully', async () => {
        mockVerifyService.verifySignatureFlow.mockRejectedValue(null);

        await expect(controller.verify(validRequestBody)).rejects.toThrow(
          new HttpException('Verification failed. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      });

      it('should handle errors without message property', async () => {
        const errorWithoutMessage = { code: 'UNKNOWN_ERROR' };
        mockVerifyService.verifySignatureFlow.mockRejectedValue(errorWithoutMessage);

        await expect(controller.verify(validRequestBody)).rejects.toThrow(
          new HttpException('Verification failed. Please try again.', HttpStatus.INTERNAL_SERVER_ERROR)
        );
      });
    });

    describe('data transformation', () => {
      it('should handle extra fields in request data gracefully', async () => {
        const requestWithExtraFields: VerifySignatureDto = {
          data: {
            address: '0x1234567890123456789012345678901234567890',
            userId: 'discord-user-123',
            extraField: 'should-be-ignored',
            nestedExtra: { nested: 'data' },
          },
          signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          topLevelExtra: 'also-ignored',
        };

        const expectedDecodedData: DecodedData = {
          address: '0x1234567890123456789012345678901234567890',
          userId: 'discord-user-123',
          userTag: '',
          avatar: '',
          discordId: '',
          discordName: '',
          discordIcon: '',
          nonce: '',
          expiry: 0,
        };

        mockVerifyService.verifySignatureFlow.mockResolvedValue({
          message: 'Verification successful',
          address: '0x1234567890123456789012345678901234567890',
          assignedRoles: [],
        });

        await controller.verify(requestWithExtraFields);

        expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
          expectedDecodedData,
          requestWithExtraFields.signature
        );
      });

      it('should handle numeric expiry correctly', async () => {
        const requestWithNumericExpiry: VerifySignatureDto = {
          data: {
            address: '0x1234567890123456789012345678901234567890',
            expiry: 1640995200, // Unix timestamp
          },
          signature: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        };

        const expectedDecodedData: DecodedData = {
          address: '0x1234567890123456789012345678901234567890',
          userId: '',
          userTag: '',
          avatar: '',
          discordId: '',
          discordName: '',
          discordIcon: '',
          nonce: '',
          expiry: 1640995200,
        };

        mockVerifyService.verifySignatureFlow.mockResolvedValue({
          message: 'Verification successful',
          address: '0x1234567890123456789012345678901234567890',
          assignedRoles: [],
        });

        await controller.verify(requestWithNumericExpiry);

        expect(mockVerifyService.verifySignatureFlow).toHaveBeenCalledWith(
          expectedDecodedData,
          requestWithNumericExpiry.signature
        );
      });
    });
  });
});
