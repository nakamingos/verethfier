# Universal Verethfier Migration

This folder contains a single, comprehensive migration script that handles any starting database state.

## 🎯 One Script for All Scenarios

The `99999999999999_universal_migration.sql` script automatically detects your current database state and performs the appropriate migration:

### Scenario 1: Fresh Install (No Existing Tables)
- Creates modern `verifier_rules` and `verifier_user_roles` tables
- Sets up all indexes and permissions
- No data migration needed

### Scenario 2: Legacy System (Has `verifier_servers` + `verifier_users`)
- Creates modern tables 
- Migrates all legacy data to modern format
- Preserves legacy tables for safety
- Assigns 72-hour grace period for migrated users

### Scenario 3: Partial Migration (Some Tables Exist)
- Creates any missing modern tables
- Migrates any legacy data if legacy tables exist
- Safely handles mixed states

### Scenario 4: Already Migrated (Modern Tables Exist)
- Detects existing modern system
- Runs safely without making changes
- Reports "already up to date" status

## 🚀 How to Use

### Method 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to "SQL Editor"
3. Copy and paste the contents of `99999999999999_universal_migration.sql`
4. Click "Run" to execute

### Method 2: Supabase CLI
```bash
supabase db reset
# The migration will run automatically
```

### Method 3: Direct SQL Connection
```bash
psql your_database_url < supabase/migrations/99999999999999_universal_migration.sql
```

## 🔄 Idempotent Design

The script can be run multiple times safely:
- ✅ Uses `CREATE TABLE IF NOT EXISTS`
- ✅ Uses `INSERT ... ON CONFLICT DO NOTHING`
- ✅ Uses `CREATE INDEX IF NOT EXISTS`
- ✅ Detects existing data before migration
- ✅ Gracefully handles all edge cases

## 📊 What Gets Created

### Modern Tables
- **`verifier_rules`** - Stores verification rules (replaces simple server configs)
- **`verifier_user_roles`** - Tracks user role assignments with metadata

### Legacy Data Handling
- Legacy data is migrated to modern format
- Original legacy tables are preserved (not dropped)
- Migrated users get 72-hour grace period
- Special "legacy rule" created for backwards compatibility

### Performance Features
- Comprehensive indexing for fast queries
- Composite indexes for dynamic verification
- Optimized for both read and write operations

## 🔍 Migration Logs

The script provides detailed logging:
```
=================================================================
Universal Verethfier Migration Starting...
=================================================================
Current database state:
- Legacy servers table: EXISTS
- Legacy users table: EXISTS  
- Modern rules table: NOT FOUND
- Modern user_roles table: NOT FOUND
Creating modern tables if needed...
Legacy tables detected - starting data migration...
Legacy data migration completed: 42 users migrated with 72 hour grace period
=================================================================
Universal Verethfier Migration Completed Successfully!
=================================================================
Migration type: LEGACY UPGRADE
- Migrated 42 users from legacy system
- Legacy users have 72 hour grace period
- Legacy tables preserved for safety
```

## ⚠️ Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **No Downtime**: The migration preserves all existing data and functionality
3. **Backwards Compatible**: The unified API works with both legacy and modern data
4. **Grace Period**: Legacy users have 72 hours to re-verify (configurable in script)
5. **Safety**: Legacy tables are never dropped, only new tables are created

## 🆘 Troubleshooting

### If Migration Fails
1. Check Supabase logs for specific error messages
2. Ensure you have proper database permissions
3. Verify your database connection is stable
4. The script can be safely re-run after fixing issues

### Common Issues
- **Permission denied**: Ensure your database user has CREATE TABLE permissions
- **Out of disk space**: Free up database storage before running
- **Connection timeout**: Use a stable connection for large data migrations

## 📞 Support

If you encounter issues:
1. Check the migration logs for specific error messages
2. Verify your starting database state matches one of the supported scenarios
3. The script is designed to be self-documenting through detailed logging

This single migration script eliminates the need for multiple migration strategies and complex state management!

---

## Legacy Migration Files (Deprecated)

The following files are kept for reference but are no longer needed:

### 🔄 **Migration from Legacy System**
If you have existing legacy data (`verifier_servers` + `verifier_users` tables):
- Use: `20250706000001_complete_verethfier_system.sql`
- Includes automatic legacy data migration with 72-hour grace period

### 🆕 **Fresh Installation** 
If you're starting with a clean database:
- Use: `20250706000002_fresh_install.sql`
- Sets up the complete system without legacy migration complexity

## Files Structure

```
migrations/
├── 20250706000001_complete_verethfier_system.sql  # Legacy → Enhanced migration
├── 20250706000002_fresh_install.sql               # Fresh installation
└── README.md                                      # This documentation
```

## Which Migration Should I Use?

### Use Fresh Install (`20250706000002_fresh_install.sql`) if:
- ✅ You're setting up a **new Verethfier bot**
- ✅ You have a **clean/empty database**
- ✅ You **don't have existing users** to migrate
- ✅ You want the **simplest setup process**

### Use Legacy Migration (`20250706000001_complete_verethfier_system.sql`) if:
- ✅ You have an **existing legacy bot** with user data
- ✅ Your database has `verifier_servers` and `verifier_users` tables with data
- ✅ You want to **preserve existing user role assignments**
- ✅ You need the **72-hour grace period** for existing users

### Still Not Sure?
Check your database for existing data:
```sql
-- Check if you have legacy data
SELECT COUNT(*) FROM verifier_users;
SELECT COUNT(*) FROM verifier_servers;
```

- **If both return 0 or tables don't exist**: Use Fresh Install
- **If either has data**: Use Legacy Migration

## Running the Migrations

### Option 1: Fresh Installation (Recommended for New Bots)

If you're starting fresh without any existing data:

```bash
# Run the fresh installation migration
supabase migration up 20250706000002

# Or with psql:
psql -f supabase/migrations/20250706000002_fresh_install.sql
```

**Benefits:**
- ✅ Clean setup without legacy migration complexity
- ✅ All modern tables created optimally
- ✅ No legacy data processing overhead
- ✅ Faster installation

### Option 2: Legacy Migration (For Existing Legacy Bots)

If you have existing legacy data (`verifier_servers` + `verifier_users`):

```bash
# Run the complete system migration with legacy data migration
supabase migration up 20250706000001

# Or with psql:
psql -f supabase/migrations/20250706000001_complete_verethfier_system.sql
```

**Benefits:**
- ✅ Preserves all existing user data
- ✅ 72-hour grace period for legacy users
- ✅ Automatic data transformation
- ✅ Rich migration metadata

### For Existing Enhanced Installations

If you already have some of the intermediate tables from development, you may need to:

1. **Backup your data** first
2. **Drop conflicting tables** if they exist
3. **Choose the appropriate migration** (fresh vs legacy)
4. **Restore your data** if needed

## Schema Overview

### Fresh Installation Schema
```sql
-- Complete modern system (fresh install)
verifier_servers: { id, name, role_id }           # Legacy compatibility
verifier_users: { id, user_id, servers, address } # Legacy compatibility  
verifier_rules: { id, server_id, channel_id, role_id, slug, attribute_key, ... }
verifier_user_roles: { id, user_id, server_id, role_id, status, verified_at, ... }
```

### Legacy Migration Schema (Before)
```sql
-- Original legacy system
verifier_servers: { id, name, role_id }
verifier_users: { id, user_id, servers (jsonb), address }
```

### Legacy Migration Schema (After)
```sql
-- Enhanced system with legacy data preserved
verifier_servers: { ... } (unchanged, with existing data)
verifier_users: { ... } (unchanged, with existing data)
verifier_rules: { id, server_id, channel_id, role_id, slug, attribute_key, ... }
verifier_user_roles: { id, user_id, server_id, role_id, status, verified_at, ... }
```

## Features Included

### ✅ Modern Verification Rules
- Collection-based verification (`/setup add-rule`)
- Attribute-specific requirements
- Minimum item counts
- Channel-specific rules

### ✅ Enhanced Role Tracking
- Role assignment status tracking
- Verification timestamps
- Expiration dates
- Rich metadata storage

### ✅ Legacy Data Migration
- **Automatic migration** from old `verifier_users` table
- **72-hour grace period** for legacy users
- **Full audit trail** with migration metadata
- **Seamless transition** to new system

### ✅ Dynamic Role Management
- **Scheduled re-verification** (every 6 hours)
- **Automatic role removal** when users no longer qualify
- **Grace period handling** for legacy users
- **Comprehensive logging** and monitoring

## Database Tables

### `verifier_rules`
Modern verification rules configured through Discord slash commands.

**Key Fields:**
- `server_id`, `channel_id`, `role_id` - Discord identifiers
- `slug` - Collection to verify (or 'ALL')
- `attribute_key`, `attribute_value` - Specific attribute requirements
- `min_items` - Minimum holdings required

### `verifier_user_roles`
Enhanced role assignments with dynamic tracking capabilities.

**Key Fields:**
- `user_id`, `server_id`, `role_id` - Assignment identifiers
- `status` - 'active', 'revoked', or 'expired'
- `verified_at`, `last_checked` - Verification timestamps
- `expires_at` - Role expiration (null = never expires)
- `rule_id` - Link to verification rule
- `verification_data` - JSON metadata
- `user_name`, `server_name`, `role_name` - Human-readable names

## Legacy Data Handling

### Grace Period System
- **Legacy users get 72-hour protection** from immediate role removal
- **Special legacy rule** created for migrated data
- **Rich metadata** tracks migration source and timing
- **Seamless transition** to modern verification after grace period

### Migration Process
1. **Legacy rule creation** - Special placeholder rule for migrated users
2. **Data transformation** - Convert `verifier_users.servers` JSONB → individual role assignments
3. **Grace period assignment** - 72-hour protection period
4. **Metadata enrichment** - Add user names, server names, timestamps

## Troubleshooting

### Migration Errors
- **Table already exists**: Drop conflicting tables or use backup/restore approach
- **Legacy rule conflicts**: Ensure no existing rules with legacy identifiers
- **Data migration issues**: Check that `verifier_servers` table exists with valid `role_id` values

### Verification Issues
- **Legacy users not protected**: Check that `expires_at` is set correctly
- **Rules not working**: Verify `verifier_rules` table has valid Discord IDs
- **Role removal issues**: Check Discord bot permissions

## Support

For issues with migrations or the verification system:
1. Check the migration logs for detailed error messages
2. Verify Discord bot permissions in your server
3. Ensure Supabase permissions are set correctly
4. Review the comprehensive logging in the application
