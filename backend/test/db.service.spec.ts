import { Test, TestingModule } from '@nestjs/testing';
import { DbService } from '../src/services/db.service';

describe('DbService', () => {
  let service: DbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DbService],
    }).compile();

    service = module.get<DbService>(DbService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('service structure', () => {
    it('should have all required methods', () => {
      expect(typeof service.addUpdateServer).toBe('function');
      expect(typeof service.getUserServers).toBe('function');
      expect(typeof service.addServerToUser).toBe('function');
      expect(typeof service.getServerRole).toBe('function');
      expect(typeof service.addRoleMapping).toBe('function');
      expect(typeof service.getRoleMappings).toBe('function');
      expect(typeof service.deleteRoleMapping).toBe('function');
      expect(typeof service.logUserRole).toBe('function');
      expect(typeof service.getAllRulesWithLegacy).toBe('function');
      expect(typeof service.removeAllLegacyRoles).toBe('function');
      expect(typeof service.getLegacyRoles).toBe('function');
      expect(typeof service.ruleExists).toBe('function');
      expect(typeof service.findRuleWithMessage).toBe('function');
      expect(typeof service.updateRuleMessageId).toBe('function');
      expect(typeof service.findRuleByMessageId).toBe('function');
      expect(typeof service.findRulesByMessageId).toBe('function');
      expect(typeof service.getRulesByChannel).toBe('function');
      expect(typeof service.findConflictingRule).toBe('function');
    });
  });

  describe('addUpdateServer method signature', () => {
    it('should require server_id, name, and role_id parameters', () => {
      expect(service.addUpdateServer.length).toBe(3);
    });
  });

  describe('getUserServers method signature', () => {
    it('should accept user_id parameter', () => {
      expect(service.getUserServers.length).toBe(1);
    });
  });

  describe('addServerToUser method signature', () => {
    it('should accept user and server parameters', () => {
      expect(service.addServerToUser.length).toBe(4);
    });
  });

  describe('getServerRole method signature', () => {
    it('should accept server_id parameter', () => {
      expect(service.getServerRole.length).toBe(1);
    });
  });

  describe('addRoleMapping method signature', () => {
    it('should accept all required and optional parameters', () => {
      expect(service.addRoleMapping.length).toBe(10);
    });
  });

  describe('getRoleMappings method signature', () => {
    it('should accept server_id and optional channel_id', () => {
      expect(service.getRoleMappings.length).toBe(2);
    });
  });

  describe('deleteRoleMapping method signature', () => {
    it('should accept rule_id and server_id parameters', () => {
      expect(service.deleteRoleMapping.length).toBe(2);
    });
  });

  describe('logUserRole method signature', () => {
    it('should accept user and role parameters', () => {
      expect(service.logUserRole.length).toBe(4);
    });
  });

  describe('getAllRulesWithLegacy method signature', () => {
    it('should accept server_id parameter', () => {
      expect(service.getAllRulesWithLegacy.length).toBe(1);
    });
  });

  describe('removeAllLegacyRoles method signature', () => {
    it('should accept server_id parameter', () => {
      expect(service.removeAllLegacyRoles.length).toBe(1);
    });
  });

  describe('getLegacyRoles method signature', () => {
    it('should accept server_id parameter', () => {
      expect(service.getLegacyRoles.length).toBe(1);
    });
  });

  describe('ruleExists method signature', () => {
    it('should require server_id, channel_id, role_id, and slug parameters', () => {
      expect(service.ruleExists.length).toBe(4);
    });
  });

  describe('findRuleWithMessage method signature', () => {
    it('should accept guild_id and channel_id parameters', () => {
      expect(service.findRuleWithMessage.length).toBe(2);
    });
  });

  describe('updateRuleMessageId method signature', () => {
    it('should accept rule_id and message_id parameters', () => {
      expect(service.updateRuleMessageId.length).toBe(2);
    });
  });

  describe('findRuleByMessageId method signature', () => {
    it('should accept guild_id, channel_id, and message_id parameters', () => {
      expect(service.findRuleByMessageId.length).toBe(3);
    });
  });

  describe('findRulesByMessageId method signature', () => {
    it('should accept guild_id, channel_id, and message_id parameters', () => {
      expect(service.findRulesByMessageId.length).toBe(3);
    });
  });

  describe('getRulesByChannel method signature', () => {
    it('should accept guild_id and channel_id parameters', () => {
      expect(service.getRulesByChannel.length).toBe(2);
    });
  });
});
