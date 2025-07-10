import { Test, TestingModule } from '@nestjs/testing';
import { RecoverVerificationHandler } from '../src/services/discord-commands/handlers/recover-verification.handler';
import { DbService } from '../src/services/db.service';
import { DiscordMessageService } from '../src/services/discord-message.service';

describe('RecoverVerificationHandler - Minimal', () => {
  let handler: RecoverVerificationHandler;

  beforeEach(async () => {
    const mockDbService = {
      getRulesByChannel: jest.fn(),
    };

    const mockMessageService = {
      findExistingVerificationMessage: jest.fn(),
      createVerificationMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoverVerificationHandler,
        {
          provide: DbService,
          useValue: mockDbService,
        },
        {
          provide: DiscordMessageService,
          useValue: mockMessageService,
        },
      ],
    }).compile();

    handler = module.get<RecoverVerificationHandler>(RecoverVerificationHandler);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });
});
