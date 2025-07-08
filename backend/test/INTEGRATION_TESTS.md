# 🧪 Integration Tests Documentation

This document describes the comprehensive integration testing suite for the Verethfier backend's core verification services.

## 📋 Overview

The integration tests verify that the core verification services work correctly against a real local Supabase database. Unlike unit tests that use mocks, these tests validate the entire verification workflow including:

- Database operations
- Service orchestration
- Rule processing
- Role management
- Error handling

## 🚀 Running Integration Tests

### Quick Start
```bash
# Run all integration tests with auto Supabase management
yarn test:integration

# Run with verbose output
yarn test:integration:verbose

# Run all database tests (includes DbService + integration tests)
yarn test:db
```

### Manual Supabase Management
```bash
# Start Supabase manually
yarn supabase:start

# Run tests without auto-management
MANUAL_SUPABASE=true yarn test:integration

# Stop Supabase when done
yarn supabase:stop
```

## 📁 Test Files

### Core Service Integration Tests

#### 1. **VerificationEngine Integration Tests**
**File:** `verification-engine.integration.spec.ts`

**Purpose:** Tests the core verification engine that processes asset verification logic.

**Key Test Areas:**
- ✅ Single user verification (`verifyUser`)
- ✅ Bulk verification against multiple rules (`verifyUserBulk`) 
- ✅ Server-wide verification (`verifyUserForServer`)
- ✅ Rule type detection (modern vs legacy)
- ✅ Error handling for invalid addresses and missing rules
- ✅ Edge cases and malformed inputs

**Database Tables Used:**
- `verifier_servers` - Server configuration
- `verifier_rules` - Verification rules
- Queries public marketplace data via DataService

---

#### 2. **VerificationService Integration Tests**
**File:** `verification.service.integration.spec.ts`

**Purpose:** Tests the orchestration layer that coordinates between VerificationEngine, DbService, and DataService.

**Key Test Areas:**
- ✅ Service delegation to VerificationEngine
- ✅ String/number rule ID handling
- ✅ Bulk verification orchestration
- ✅ Server verification coordination
- ✅ Legacy method compatibility (`verifyUserAgainstRule`)
- ✅ Service integration and data flow
- ✅ Error propagation and handling

**Dependencies:**
- Uses real VerificationEngine and DbService
- Mocks DiscordVerificationService (Discord API not needed)

---

#### 3. **DynamicRoleService Integration Tests**
**File:** `dynamic-role.service.integration.spec.ts`

**Purpose:** Tests role monitoring, tracking, and management functionality.

**Key Test Areas:**
- ✅ Role assignment tracking and status management
- ✅ Active role assignment queries and filtering
- ✅ Multi-server user role queries
- ✅ Role assignment creation and updates
- ✅ Expiration date handling
- ✅ Referential integrity with rules
- ✅ Complex filtering and time-based queries

**Database Tables Used:**
- `verifier_servers` - Server configuration
- `verifier_rules` - Verification rules
- `verifier_user_roles` - Role assignments and tracking

---

## 🗄️ Database Schema Used

### Tables Created/Used by Tests:

#### `verifier_servers`
```sql
- id (text) - Discord server ID
- name (text) - Server name
- role_id (text) - Default role ID
```

#### `verifier_rules` 
```sql
- id (bigint) - Rule ID
- server_id (text) - Discord server ID
- server_name (text) - Server name
- channel_id (text) - Discord channel ID
- channel_name (text) - Channel name
- slug (text) - Collection slug
- role_id (text) - Discord role ID
- role_name (text) - Role name
- attribute_key (text) - NFT attribute key
- attribute_value (text) - NFT attribute value
- min_items (int) - Minimum required items
```

#### `verifier_user_roles`
```sql
- id (uuid) - Assignment ID
- user_id (text) - Discord user ID
- server_id (text) - Discord server ID
- role_id (text) - Discord role ID
- rule_id (text) - Associated rule ID
- address (text) - Ethereum address
- user_name (text) - Discord username
- server_name (text) - Server name
- role_name (text) - Role name
- status (text) - active|expired|revoked
- verified_at (timestamp) - Verification time
- last_checked (timestamp) - Last re-verification
- expires_at (timestamp) - Expiration time
```

## 🔧 Test Environment Setup

### Automatic Setup (Recommended)
The tests use global setup/teardown that automatically:

1. **Starts Supabase CLI** if not running
2. **Runs database migrations** to ensure schema is current
3. **Inserts test data** for consistent test environment
4. **Sets environment variables** for DbService connection
5. **Cleans up** test data between tests

### Manual Setup
If you prefer manual control:

```bash
# Install Supabase CLI (see SUPABASE_CLI_INSTALL.md)
yarn supabase:start

# Set environment variables
export DB_SUPABASE_URL="http://localhost:54321"
export DB_SUPABASE_KEY="your-service-role-key"

# Run migrations manually
supabase db reset

# Run tests
MANUAL_SUPABASE=true yarn test:integration
```

## 📊 Test Coverage

### ✅ **Well Tested Areas:**
- Core verification logic and rule processing
- Database CRUD operations for all tables
- Service orchestration and data flow
- Error handling and edge cases
- Role assignment lifecycle management
- Multi-server and multi-rule scenarios

### ⚠️ **Mocked Areas:**
- Discord API interactions (DiscordService, DiscordVerificationService)
- External marketplace data queries (uses DataService but doesn't verify external API)
- Scheduled tasks and cron jobs (tested methods, not actual scheduling)

### 🎯 **What These Tests Validate:**
- ✅ Database schema compatibility
- ✅ Service dependency injection
- ✅ Rule evaluation logic
- ✅ Role state management
- ✅ Error handling pathways
- ✅ Data integrity and relationships
- ✅ Query performance and correctness

## 🐛 Troubleshooting

### Common Issues:

#### "Supabase not available"
- Ensure Docker is running
- Install Supabase CLI (see `SUPABASE_CLI_INSTALL.md`)
- Check if port 54321 is available

#### "Cannot execute migrations"
- Some migrations use RPC functions that may not be available
- Tests will fall back to direct SQL execution
- Check migration warnings in test output

#### Tests fail with "Cannot read properties of undefined"
- Usually indicates service injection issues
- Verify environment variables are set correctly
- Check that global setup completed successfully

#### "Module not found" errors
- Run `yarn install` to ensure dependencies are installed
- Check that TypeScript compilation is successful

### Debug Mode:
```bash
# Run with verbose output to see detailed test execution
yarn test:integration:verbose

# Run with Jest debug output
yarn test:debug --testPathPatterns=integration.spec.ts
```

## 📈 Future Enhancements

### Potential Additions:
1. **Performance tests** - Test query performance under load
2. **Concurrency tests** - Test multiple simultaneous verifications
3. **Migration tests** - Test database migration scenarios
4. **Data validation tests** - Test constraint enforcement
5. **Backup/restore tests** - Test data recovery scenarios

### Integration with CI/CD:
- Tests are designed to run in CI environments
- Require Docker support for Supabase
- Generate coverage reports compatible with CI systems
- Fast execution (typically < 10 seconds)

## 📚 Related Documentation

- [`README.md`](./README.md) - Overall testing setup
- [`SUPABASE_CLI_INSTALL.md`](./SUPABASE_CLI_INSTALL.md) - CLI installation guide
- [`db.service.spec.ts`](./db.service.spec.ts) - Core database service tests
- [Service documentation](../src/services/) - Individual service documentation

---

These integration tests provide confidence that the core verification workflow functions correctly against real database operations, ensuring the system works as expected in production environments.
