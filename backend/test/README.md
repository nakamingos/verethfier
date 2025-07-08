# Database Testing Setup

This directory contains the Jest testing setup for Supabase database operations.

## Overview

The testing setup includes:

- **Automatic Supabase Management**: Starts and stops Supabase automatically
- **Global Setup**: Runs migrations and inserts test data before all tests
- **Global Teardown**: Cleans up test data and stops Supabase after all tests complete
- **Individual Test Setup**: Each test can create and cleanup its own test data

## Files

- `db-setup.ts` - Main database setup and teardown functionality
- `global-setup.ts` - Jest global setup script
- `global-teardown.ts` - Jest global teardown script
- `test-database.ts` - Test database utilities and helpers
- `db-setup.spec.ts` - Tests to verify the setup is working correctly

## Automatic Supabase Management

### Default Behavior (Recommended)
The test setup **automatically starts Supabase** if it's not already running:

```bash
# Just run the tests - Supabase will start automatically!
npm run test:db
```

### Manual Control (Optional)
If you prefer to manage Supabase yourself:

```bash
# Start Supabase manually
npm run supabase:start

# Run tests without auto-start/stop
npm run test:db:manual

# Stop Supabase manually when done
npm run supabase:stop
```

## Requirements

### Supabase CLI
The automatic setup requires the Supabase CLI to be installed:

```bash
# macOS (Homebrew)
brew install supabase/tap/supabase

# Linux (APT - Ubuntu/Debian)  
sudo apt install supabase

# Windows (Scoop)
scoop install supabase

# Verify installation
supabase --version
```

**📋 Full installation guide:** See [`SUPABASE_CLI_INSTALL.md`](./SUPABASE_CLI_INSTALL.md) for detailed instructions for all platforms.

**⚠️ Note:** Global npm/yarn installation (`yarn global add supabase`) is NOT supported by Supabase CLI.

If the CLI is not available, tests will fall back to manual mode and skip if Supabase isn't running.

### Environment Variables

The setup uses these environment variables (with defaults for local development):

- `SUPABASE_URL` - Defaults to `http://localhost:54321`
- `SUPABASE_KEY` - Defaults to the local Supabase service role key
- `MANUAL_SUPABASE` - Set to `true` to disable auto-start/stop

## Test Data

The setup automatically inserts test data from the provided SQL files:

- **verifier_servers**: Test Discord servers
- **verifier_rules**: Test verification rules
- **verifier_user_roles**: Test user role assignments
- **verifier_users**: Legacy test user data (if table exists)

## Running Tests

### Recommended (Automatic)
```bash
# Run all tests (Supabase auto-managed)
npm test

# Run only database tests (Supabase auto-managed)
npm run test:db

# Run with verbose output
npm run test:db:verbose

# Verify setup is working
npm run test:setup
```

### Manual Control
```bash
# Start Supabase manually first
npm run supabase:start

# Run tests without auto-management
npm run test:db:manual

# Stop when done
npm run supabase:stop
```

### Direct Supabase Commands
```bash
# Start Supabase
npm run supabase:start

# Stop Supabase  
npm run supabase:stop

# Reset database (WARNING: destroys all data)
npm run supabase:reset
```

## Test Structure

### Global Setup (runs once before all tests)
1. Check if Supabase is accessible
2. Run database migrations
3. Insert test data
4. Report setup status

### Individual Tests
1. Each test file can use `TestDatabase.getInstance()` for utilities
2. Tests should check `isHealthy()` before running database operations
3. Tests are automatically skipped if Supabase is not available

### Global Teardown (runs once after all tests)
1. Clean up all test data
2. Reset database to clean state

## Important Notes

### Database Separation
- **DB Service**: Tests the bot's storage database (write operations)
- **Data Service**: Tests the public read-only database (read operations only)
- Only write tests for the DB service, not the Data service

### Test Data IDs
- Real test data uses actual Discord IDs from the provided SQL files
- Generated test data uses `test_` prefixes for easy cleanup
- Cleanup operations target both real test data IDs and `test_` prefixed data

### Error Handling
- Tests gracefully handle missing Supabase instances
- Setup failures don't prevent tests from running (they're just skipped)
- Teardown failures are logged but don't fail the test suite

### SQL Execution
The setup attempts to use a `exec_sql` RPC function for direct SQL execution. If this function doesn't exist, it falls back to using the Supabase client's built-in methods for data operations.

## Troubleshooting

### Supabase Not Starting
```bash
# Reset Supabase if having issues
supabase stop
supabase start
```

### Migration Errors
If migrations fail, you can run them manually:
```bash
supabase db reset
```

### Test Data Issues
You can manually clean up test data by running:
```sql
DELETE FROM verifier_user_roles WHERE id IN ('5', '6', '7') OR user_id LIKE 'test_%';
DELETE FROM verifier_rules WHERE id IN ('7', '8', '120') OR server_id LIKE 'test_%';
DELETE FROM verifier_servers WHERE id IN ('1369930881267142686', '919772570612539422') OR id LIKE 'test_%';
```

### Permission Issues
Make sure your Supabase service role key has the necessary permissions to create functions and modify data.
