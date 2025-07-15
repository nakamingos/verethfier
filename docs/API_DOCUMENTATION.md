# Verethfier Backend API Documentation

## Overview

The Verethfier backend provides a unified verification system for Discord servers using Ethscriptions-based token gating. The API uses EIP-712 signature verification and supports both legacy and modern verification rules transparently.

## Architecture

### Core Components

- **Unified Verification Engine**: Single entry point for all verification types
- **Channel-Based Verification**: Simplified flow without message tracking dependencies
- **Dynamic Role Management**: Automated role assignment and removal
- **High-Performance Caching**: Redis-compatible caching for optimal performance
- **Security-First Design**: Multiple layers of protection and validation

### Database Schema

```sql
-- Modern unified role tracking
verifier_user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  rule_id TEXT
);

-- Channel-based verification rules
verifier_rules (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  slug TEXT,
  attribute_key TEXT,
  attribute_value TEXT,
  min_items INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Secure nonce management
nonces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Endpoints

### POST /verify-signature

Main verification endpoint that handles wallet signature verification and role assignment.

#### Request Body

```typescript
{
  data: {
    userId: string;        // Discord user ID
    userTag: string;       // Discord username#discriminator
    avatar: string;        // Discord avatar URL
    discordId: string;     // Discord guild/server ID
    discordName: string;   // Discord server name
    discordIconURL: string; // Discord server icon URL
    nonce: string;         // Cryptographic nonce
    expiry: number;        // Unix timestamp expiry
    address: string;       // Ethereum wallet address
  };
  signature: string;       // EIP-712 signature
}
```

#### Response

```typescript
{
  message: string;           // Success message
  address: string;           // Verified wallet address
  assignedRoles: string[];   // Array of role IDs assigned
}
```

#### Error Responses

```typescript
// 400 Bad Request
{
  message: string;           // Validation error details
  statusCode: 400;
}

// 500 Internal Server Error
{
  message: string;           // Generic error message
  statusCode: 500;
}
```

## Core Services

### VerificationEngine

Central verification processor that handles all verification types transparently.

```typescript
class VerificationEngine {
  /**
   * Main verification method - unified entry point
   */
  async verifyUser(
    userId: string,
    ruleId: string | number,
    address: string
  ): Promise<VerificationResult>;

  /**
   * Bulk verification for multiple rules
   */
  async verifyUserAgainstAllRules(
    userId: string,
    guildId: string,
    address: string
  ): Promise<BulkVerificationResult>;
}

interface VerificationResult {
  isValid: boolean;
  ruleType: 'legacy' | 'modern' | 'unknown' | 'error';
  userId: string;
  ruleId: string | number;
  address: string;
  rule?: VerifierRole;
  matchingAssetCount?: number;
  error?: string;
  verificationDetails?: {
    collection: string;
    attributeKey: string;
    attributeValue: string;
    minItems: number;
    foundAssets: number;
  };
}
```

### DataService

Handles Ethscriptions marketplace queries with advanced filtering.

```typescript
class DataService {
  /**
   * Check basic asset ownership
   */
  async checkAssetOwnership(address: string): Promise<any>;

  /**
   * Advanced filtering with criteria
   */
  async checkAssetOwnershipWithCriteria(
    address: string,
    slug?: string,
    attributeKey?: string,
    attributeValue?: string,
    minItems?: number
  ): Promise<any>;
}
```

### CacheService

High-performance caching layer with intelligent TTL management.

```typescript
class CacheService {
  // Basic cache operations
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, ttl?: number): Promise<void>;
  async del(key: string): Promise<void>;

  // Specialized cache methods
  async cacheServerRules(serverId: string, rules: any[]): Promise<void>;
  async getCachedServerRules(serverId: string): Promise<any[] | null>;
  async cacheUserAssets(address: string, assets: any[]): Promise<void>;
  async getCachedUserAssets(address: string): Promise<any[] | null>;
}
```

### DynamicRoleService

Automated role management with continuous monitoring.

```typescript
class DynamicRoleService {
  /**
   * Scheduled re-verification (runs via cron)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async performScheduledReverification(): Promise<void>;

  /**
   * Manual role sync
   */
  async syncUserRoles(userId: string, guildId: string): Promise<void>;
}
```

## Security Features

### Rate Limiting

Multi-tier rate limiting protects against abuse:

```typescript
const RATE_LIMITS = {
  SHORT: {
    TTL: 1000,    // 1 second window
    LIMIT: 3,     // 3 requests maximum
  },
  MEDIUM: {
    TTL: 10000,   // 10 second window  
    LIMIT: 20,    // 20 requests maximum
  },
  LONG: {
    TTL: 60000,   // 1 minute window
    LIMIT: 100,   // 100 requests maximum
  },
};
```

### Signature Verification

EIP-712 typed data signatures ensure cryptographic proof of wallet ownership:

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

### Nonce Management

Cryptographic nonces prevent replay attacks:

- Single-use nonces with automatic expiry
- Default 5-minute expiration window
- Secure random generation
- Cache-based storage for performance

## Error Handling

### Structured Error Responses

All errors follow a consistent format with appropriate HTTP status codes:

```typescript
interface ErrorResponse {
  message: string;     // Human-readable error message
  statusCode: number;  // HTTP status code
  error?: string;      // Error type (optional)
}
```

### Common Error Scenarios

1. **Invalid Signature** (400): EIP-712 signature verification failed
2. **Expired Nonce** (400): Verification request is too old or nonce was already used
3. **Missing Rules** (404): No verification rules found for the server/channel
4. **Insufficient Holdings** (400): User doesn't own required assets
5. **Discord API Error** (500): Failed to assign/remove Discord roles

## Performance Optimizations

### Caching Strategy

- **Rules Cache**: 5 minutes TTL (rules rarely change)
- **User Assets**: 2 minutes TTL (holdings can change frequently)
- **Guild Roles**: 10 minutes TTL (Discord roles are stable)
- **Collection Slugs**: 1 hour TTL (collection metadata is stable)

### Database Optimizations

- Indexed queries on user_id, guild_id, and address fields
- Optimized joins between verification tables
- Batch operations for bulk role assignments
- Connection pooling for high concurrency

### Query Optimization

The QueryOptimizer service provides:

- Automatic query performance monitoring
- Slow query detection and logging
- Batch operation utilities
- Parameter validation and sanitization

## Integration Examples

### Frontend Integration

```typescript
// Frontend verification flow
async function verifyWallet(signer, verificationData) {
  // Sign the verification message
  const signature = await signer._signTypedData(
    typedData.domain,
    typedData.types,
    verificationData
  );

  // Submit to backend
  const response = await fetch('/verify-signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: verificationData,
      signature: signature
    })
  });

  return response.json();
}
```

### Discord Bot Integration

```typescript
// Discord slash command example
@SlashCommand({
  name: 'verify',
  description: 'Start verification process'
})
async handleVerifyCommand(interaction: CommandInteraction) {
  const nonce = await this.nonceService.createNonce(interaction.user.id);
  const verificationUrl = `${FRONTEND_URL}/verify?nonce=${nonce}&guild=${interaction.guildId}`;
  
  await interaction.reply({
    content: `Click here to verify: ${verificationUrl}`,
    ephemeral: true
  });
}
```

## Monitoring and Logging

### Structured Logging

All services use structured logging with context:

```typescript
Logger.log(`Verification started for user ${userId}`, 'VerificationEngine');
Logger.debug(`Rule type detected: ${ruleType}`, 'VerificationEngine');
Logger.error(`Verification failed: ${error}`, 'VerificationEngine');
```

### Performance Metrics

- Verification processing times
- Database query performance
- Cache hit/miss ratios
- Discord API response times
- Error rates by type

### Health Monitoring

- Database connection health
- Discord bot connectivity
- Cache service availability
- External API dependencies
