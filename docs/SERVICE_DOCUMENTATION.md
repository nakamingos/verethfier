# Service Documentation

## Service Architecture Overview

The Verethfier backend uses a modular service architecture with clear separation of concerns. Each service has a specific responsibility and well-defined interfaces for interaction with other services.

## Core Services

### VerificationEngine

**Purpose**: Central verification processor that handles all verification types transparently.

**Key Features**:
- Unified API for all verification types
- Automatic legacy vs modern rule detection
- Performance optimized with caching
- Comprehensive error handling and logging

**Methods**:
```typescript
async verifyUser(userId: string, ruleId: string | number, address: string): Promise<VerificationResult>
async verifyUserAgainstAllRules(userId: string, guildId: string, address: string): Promise<BulkVerificationResult>
```

**Usage**:
```typescript
const result = await verificationEngine.verifyUser('123456789', 'rule_001', '0x742d35cc...');
if (result.isValid) {
  console.log(`User verified with ${result.matchingAssetCount} matching assets`);
}
```

### DataService

**Purpose**: Handles all Ethscriptions marketplace data queries with advanced filtering capabilities.

**Key Features**:
- Asset ownership verification
- Collection and attribute-based filtering
- Marketplace escrow support
- Case-insensitive address matching

**Methods**:
```typescript
async checkAssetOwnership(address: string): Promise<any>
async checkAssetOwnershipWithCriteria(address: string, slug?: string, attributeKey?: string, attributeValue?: string, minItems?: number): Promise<any>
```

**Usage**:
```typescript
// Check basic ownership
const count = await dataService.checkAssetOwnership('0x742d35cc...');

// Check with specific criteria
const assets = await dataService.checkAssetOwnershipWithCriteria(
  '0x742d35cc...',
  'punks-legacy',
  'trait',
  'rare',
  1
);
```

### DbService

**Purpose**: Comprehensive database operations layer with support for both legacy and modern schemas.

**Key Features**:
- Unified role tracking via verifier_user_roles
- Legacy data migration support
- Channel-based verification rules
- Optimized queries with proper indexing

**Methods**:
```typescript
async addRoleMapping(guildId: string, guildName: string, channelId: string, channelName: string, slug: string, roleId: string, roleName: string, attributeKey?: string, attributeValue?: string, minItems?: number): Promise<any>
async getRoleMappings(guildId: string, channelId?: string): Promise<VerifierRole[]>
async logUserRole(userId: string, guildId: string, roleId: string, address: string, status: string, ruleId?: string): Promise<void>
async getUserRoleHistory(userId: string, guildId: string): Promise<any[]>
```

### CacheService

**Purpose**: High-performance caching layer with intelligent TTL management.

**Key Features**:
- Automatic TTL management based on data type
- Error resilient with graceful fallbacks
- Memory efficient with automatic cleanup
- Full TypeScript support with generics

**Methods**:
```typescript
async get<T>(key: string): Promise<T | null>
async set<T>(key: string, value: T, ttl?: number): Promise<void>
async del(key: string): Promise<void>
async getOrSet<T>(key: string, fallbackFn: () => Promise<T>, ttl: number): Promise<T>
```

**Cache TTL Configuration**:
```typescript
const TTL = {
  RULES: 300,        // 5 minutes - Rules don't change often
  USER_ASSETS: 120,  // 2 minutes - Asset ownership changes
  GUILD_ROLES: 600,  // 10 minutes - Discord roles are relatively stable
  SLUGS: 3600,       // 1 hour - Collection slugs rarely change
  NONCES: 300,       // 5 minutes - Nonce expiry time
}
```

### DiscordService

**Purpose**: Main Discord bot integration service handling client management and slash commands.

**Key Features**:
- Automatic bot initialization
- Slash command registration and handling
- Role autocomplete functionality
- Integration with verification services

**Methods**:
```typescript
async initializeBot(): Promise<void>
async refreshSlashCommands(): Promise<void>
```

**Configuration**:
- Automatically initializes if Discord is enabled
- Registers slash commands on startup
- Handles role autocomplete with server context

### WalletService

**Purpose**: EIP-712 signature verification and wallet authentication.

**Key Features**:
- EIP-712 typed data signature verification
- Nonce validation for replay attack prevention
- Expiry checking for time-bound verification
- Address recovery from signatures

**Methods**:
```typescript
async verifySignature(data: DecodedData, signature: string): Promise<string>
```

**EIP-712 Message Format**:
```typescript
const typedData = {
  domain: {
    name: 'Verethfier',
    version: '1',
    chainId: 1,
  },
  types: {
    Verification: [
      { name: 'address', type: 'address' },
      { name: 'userId', type: 'string' },
      { name: 'discordId', type: 'string' },
      { name: 'nonce', type: 'string' },
      { name: 'expiry', type: 'uint256' },
    ],
  },
  primaryType: 'Verification',
  message: verificationData,
};
```

### NonceService

**Purpose**: Cryptographic nonce management for secure verification flows.

**Key Features**:
- Secure random nonce generation
- Time-based expiry with configurable TTL
- Cache-based storage for high performance
- Replay attack prevention

**Methods**:
```typescript
async createNonce(userId: string, messageId?: string, channelId?: string): Promise<string>
async validateNonce(userId: string, nonce: string): Promise<boolean>
async isNonceUsed(userId: string): Promise<boolean>
async markNonceAsUsed(userId: string): Promise<void>
```

### DynamicRoleService

**Purpose**: Automated role management with continuous monitoring and scheduled re-verification.

**Key Features**:
- Scheduled re-verification via cron jobs
- Automatic role assignment and removal
- Grace period handling for rule changes
- Discord API rate limit management

**Methods**:
```typescript
@Cron(CronExpression.EVERY_HOUR)
async performScheduledReverification(): Promise<void>
async syncUserRoles(userId: string, guildId: string): Promise<void>
```

**Configuration**:
- Runs hourly re-verification by default
- Configurable verification intervals per rule
- Respects Discord API rate limits
- Provides detailed logging and metrics

### SimpleRoleMonitorService

**Purpose**: Lightweight manual role management for on-demand verification.

**Key Features**:
- Manual re-verification triggered by commands
- No automatic scheduling (lightweight design)
- Integration with existing verification infrastructure
- Detailed reporting of verification actions

**Methods**:
```typescript
async reverifyUser(userId: string, serverId: string): Promise<{verified: string[], revoked: string[], errors: string[]}>
async reverifyServer(serverId: string, limit?: number): Promise<ReverificationSummary>
```

## Service Integration Patterns

### Dependency Injection

All services use NestJS dependency injection for clean architecture:

```typescript
@Injectable()
export class VerificationService {
  constructor(
    private readonly dbSvc: DbService,
    private readonly dataSvc: DataService,
    private readonly discordVerificationSvc: DiscordVerificationService,
    private readonly verificationEngine: VerificationEngine,
  ) {}
}
```

### Error Handling

Services implement consistent error handling patterns:

```typescript
try {
  const result = await this.performOperation();
  Logger.log(`Operation successful: ${result.id}`, 'ServiceName');
  return result;
} catch (error) {
  Logger.error(`Operation failed: ${error.message}`, 'ServiceName');
  throw new Error(`Service operation failed: ${error.message}`);
}
```

### Logging Standards

All services use structured logging with context:

```typescript
Logger.log(`Starting verification for user ${userId}`, 'VerificationEngine');
Logger.debug(`Rule type detected: ${ruleType}`, 'VerificationEngine');
Logger.warn(`Slow query detected: ${duration}ms`, 'DbService');
Logger.error(`Discord API error: ${error.message}`, 'DiscordService');
```

## Performance Considerations

### Caching Strategy

Services implement intelligent caching based on data volatility:
- **High volatility** (user assets): Short TTL (2 minutes)
- **Medium volatility** (verification rules): Medium TTL (5 minutes)
- **Low volatility** (collection metadata): Long TTL (1 hour)

### Database Optimization

- Connection pooling for high concurrency
- Indexed queries on frequently accessed fields
- Batch operations for bulk updates
- Query optimization through QueryOptimizer service

### Rate Limiting

Services respect external API rate limits:
- Discord API: Automatic retry with exponential backoff
- Ethscriptions API: Request queuing and throttling
- Internal rate limiting on verification endpoints

## Testing Strategy

### Unit Testing

Each service has comprehensive unit tests with:
- Mock dependencies for isolation
- Edge case coverage
- Error scenario testing
- Performance benchmarking

### Integration Testing

Cross-service integration tests verify:
- Service interaction patterns
- Data flow consistency
- Error propagation
- Performance under load

### Test Coverage

Current test coverage by service:
- VerificationEngine: 95%+
- DataService: 90%+
- DbService: 88%+
- CacheService: 92%+
- DiscordService: 85%+
- WalletService: 96%+

## Configuration Management

### Environment Variables

Services use centralized configuration through EnvironmentConfig:

```typescript
export class EnvironmentConfig {
  public static readonly DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  public static readonly DATA_SUPABASE_URL = process.env.DATA_SUPABASE_URL;
  public static readonly DB_SUPABASE_KEY = process.env.DB_SUPABASE_KEY;
  
  public static validate(): void {
    // Validation logic
  }
}
```

### Constants

Application constants are centralized:

```typescript
export const CONSTANTS = {
  DISCORD_INITIALIZATION_TIMEOUT: 10000,
  DEFAULT_NONCE_EXPIRY: 300000,
  RATE_LIMIT: {
    SHORT: { TTL: 1000, LIMIT: 3 },
    MEDIUM: { TTL: 10000, LIMIT: 20 },
    LONG: { TTL: 60000, LIMIT: 100 },
  },
};
```

## Monitoring and Observability

### Health Checks

Services implement health check endpoints:
- Database connectivity
- External API availability
- Cache service status
- Discord bot connection

### Metrics Collection

Key metrics tracked per service:
- Request/response times
- Error rates and types
- Cache hit/miss ratios
- Resource utilization

### Alerting

Automated alerts for:
- Service failures
- Performance degradation
- High error rates
- External dependency issues
