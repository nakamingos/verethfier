# Refactoring Plan: DiscordCommandsService

## Current Issues
- **723 lines** - Too long for a single service
- **handleAddRule method** - ~200 lines (should be <30)
- **Mixed responsibilities** - Command handling + validation + role management + message creation

## Proposed Refactoring Strategy

### 1. Split into Multiple Services

#### Create `RuleValidationService`
```typescript
@Injectable()
export class RuleValidationService {
  async validateAddRuleRequest(interaction, options)
  async checkLegacyRoles(guildId)
  async validateRolePermissions(guild, roleName)
  async checkForDuplicateRules(guildId, channelId, criteria)
}
```

#### Create `RoleManagementService`
```typescript
@Injectable()
export class RoleManagementService {
  async findOrCreateRole(guild, roleName, creator)
  async validateRoleHierarchy(guild, role)
  async createRoleWithPosition(guild, roleOptions)
}
```

#### Create `RulePersistenceService`
```typescript
@Injectable()
export class RulePersistenceService {
  async createRule(ruleData)
  async deleteRule(ruleId, guildId)
  async migrateRule(legacyRule, newCriteria)
  async listRules(guildId, channelId?)
}
```

### 2. Refactor DiscordCommandsService

```typescript
@Injectable()
export class DiscordCommandsService {
  constructor(
    private ruleValidation: RuleValidationService,
    private roleManagement: RoleManagementService,
    private rulePersistence: RulePersistenceService,
    private messageSvc: DiscordMessageService
  ) {}

  // Keep only high-level command orchestration (~30-50 lines each)
  async handleAddRule(interaction) {
    // 1. Validate request
    // 2. Handle role management  
    // 3. Create rule
    // 4. Send response
  }
}
```

### 3. Extract Constants and Types

#### Create `discord-command.types.ts`
```typescript
export interface RuleCreationData {
  channel: TextChannel;
  role: Role;
  slug: string;
  attributeKey: string;
  attributeValue: string;
  minItems: number;
}

export interface DuplicateRuleContext {
  existingRule: any;
  newRuleData: RuleCreationData;
}
```

#### Create `discord-command.constants.ts`
```typescript
export const DISCORD_COMMAND_CONSTANTS = {
  MAX_RULES_PER_CHANNEL: 10,
  DEFAULT_ROLE_COLOR: 'Blue',
  DUPLICATE_WARNING_TIMEOUT: 300000, // 5 minutes
};
```

## Benefits of Refactoring

1. **Single Responsibility** - Each service has one clear purpose
2. **Testability** - Smaller, focused services are easier to test
3. **Maintainability** - Changes to validation logic don't affect role management
4. **Reusability** - Role management can be used by other services
5. **Readability** - Each file is <300 lines, methods are <30 lines

## Implementation Steps

1. **Phase 1**: Extract validation logic to new service
2. **Phase 2**: Extract role management logic  
3. **Phase 3**: Extract rule persistence logic
4. **Phase 4**: Refactor main service to orchestrate sub-services
5. **Phase 5**: Update tests to match new structure

## Expected Results

- **DiscordCommandsService**: ~200 lines (down from 723)
- **RuleValidationService**: ~150 lines
- **RoleManagementService**: ~120 lines  
- **RulePersistenceService**: ~100 lines
- **Better test coverage** with focused unit tests
- **Easier maintenance** and feature additions
