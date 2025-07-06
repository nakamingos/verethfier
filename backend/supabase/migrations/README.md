# Verethfier Migrations Documentation

## Overview

This folder contains the database migrations for the Verethfier Discord bot system. The bot provides dynamic role management based on ethscriptions collection holdings.

## Migration Strategy

We provide **two migration options** depending on your starting point:

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
