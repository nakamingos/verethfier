import { Test, TestingModule } from '@nestjs/testing';

import { CONSTANTS } from '../src/constants';
import { UserAddressService } from '../src/services/user-address.service';

describe('UserAddressService', () => {
  let service: UserAddressService;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn(),
      single: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAddressService,
        {
          provide: 'SUPABASE_CLIENT',
          useValue: mockSupabaseClient,
        },
      ],
    }).compile();

    service = module.get<UserAddressService>(UserAddressService);
    jest.clearAllMocks();
  });

  it('rejects an address that is already linked to another user', async () => {
    mockSupabaseClient.order.mockResolvedValueOnce({
      data: [
        {
          id: 10,
          user_id: 'other-user',
          address: '0xabc',
          user_name: 'Other User',
          created_at: '2026-01-01T00:00:00.000Z',
          last_verified_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      error: null,
    });

    const result = await service.addUserAddress('current-user', '0xAbC', 'Current User');

    expect(result).toEqual({
      success: false,
      error: CONSTANTS.ERRORS.WALLET_ADDRESS_ALREADY_VERIFIED,
    });
    expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
  });

  it('maps a unique constraint race to the wallet ownership error', async () => {
    mockSupabaseClient.order
      .mockResolvedValueOnce({
        data: [],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 11,
            user_id: 'other-user',
            address: '0xabc',
            user_name: 'Other User',
            created_at: '2026-01-01T00:00:00.000Z',
            last_verified_at: '2026-01-02T00:00:00.000Z',
          },
        ],
        error: null,
      });
    mockSupabaseClient.single.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "user_wallets_address_key"',
      },
    });

    const result = await service.addUserAddress('current-user', '0xAbC', 'Current User');

    expect(result).toEqual({
      success: false,
      error: CONSTANTS.ERRORS.WALLET_ADDRESS_ALREADY_VERIFIED,
    });
  });
});
