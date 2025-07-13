# Dynamic Role Management Implementation Guide

## Overview

Your ethscriptions verification bot now has a complete dynamic role management system that continuously monitors user holdings and automatically removes roles when users no longer meet the criteria. This addresses the "verify once, keep roles forever" problem.

The system has been refactored to use a single-table approach with the enhanced `verifier_user_roles` table, consolidating all role tracking functionality while providing a seamless migration path for legacy data.

## Architecture

### 1. Enhanced Role Tracking (Single Table)
- **Table**: `verifier_user_roles` (enhanced with new columns)
- **Purpose**: Unified tracking of all role assignments with verification status, timestamps, and metadata
- **Features**: 
  - Status tracking (active, expired, revoked)
  - Last verification timestamps
  - Optional expiration dates
  - User/server/role metadata
  - Legacy data migration support
  - Grace period handling for migrated users

### 2. Services Added

#### `DynamicRoleService`
- **Scheduled re-verification**: Runs every 6 hours by default
- **Automatic role removal**: Removes roles when holdings no longer qualify
- **Batch processing**: Handles large numbers of assignments efficiently
- **Rate limiting**: Includes delays to avoid Discord API limits
- **Legacy support**: Handles migrated data with grace periods

#### `SimpleRoleMonitorService`
- **Manual re-verification**: Admin-triggered verification for specific users/servers
- **Statistics and monitoring**: Provides insights into role assignment health
- **User lookup**: Check current role status and history
- **Migration support**: Tools for validating legacy data migration

### 3. Database Methods (Enhanced DbService)
- `trackRoleAssignment()` - Track new role assignments
- `getActiveRoleAssignments()` - Get assignments needing verification
- `updateRoleVerification()` - Update verification status
- `revokeRoleAssignment()` - Mark assignments as revoked
- `getRoleAssignmentStats()` - Get monitoring statistics
- `getUserRoleHistory()` - Get user's role assignment history
- `getExpiringSoonAssignments()` - Find assignments approaching expiration
- `cleanupExpiredAssignments()` - Remove expired assignments
- `findUserRoleAssignment()` - Find specific user role assignments
- `updateRoleAssignmentStatus()` - Update status of role assignments

### 4. Discord Integration
- `removeUserRole()` - Remove Discord roles
- `addUserRoleDynamic()` - Add roles (separate from verification flow)
- `isUserInServer()` - Check if user is still in server
- `getGuildMember()` - Get Discord member information

## Setup Instructions

### 1. Database Migration

The system uses a comprehensive migration strategy to transition from the legacy two-table system to the enhanced single-table approach:

#### Migration Files (in order):
1. **20250706000001_create_enhanced_verifier_user_roles.sql** - Drops and recreates verifier_user_roles with enhanced schema
2. **20250706000002_create_legacy_rule.sql** - Creates a special "legacy" rule for migrated data
3. **20250706000003_migrate_legacy_data.sql** - Migrates data from verifier_users/servers with 72-hour grace period
4. **20250706000004_test_migration_data.sql** - Creates test data for migration validation
5. **20250706000005_verify_migration_results.sql** - Provides verification queries for migration success

```bash
# Apply all migrations in Supabase
# The migrations will:
# 1. Enhance the verifier_user_roles table schema
# 2. Create the legacy rule type
# 3. Migrate all existing data with grace periods
# 4. Set up test data for validation
# 5. Provide verification queries
```

The migration:
- **Preserves all existing data** from verifier_users and verifier_servers
- **Adds 72-hour grace period** for legacy users (no immediate role removal)
- **Creates rich metadata** for tracking migration source and timestamps
- **Maintains referential integrity** with existing rules and servers
- **Provides rollback safety** with comprehensive logging

### 2. Environment Configuration

The system uses your existing environment variables. No additional configuration required.

### 3. Module Integration

The services are already added to `AppModule`:
- `DynamicRoleService` (with cron jobs)
- `SimpleRoleMonitorService`
- `ScheduleModule` for cron functionality

### 4. Legacy Data Handling

The migration provides special handling for legacy data:
- **Automatic migration** from verifier_users and verifier_servers
- **72-hour grace period** before legacy users face role removal
- **Legacy rule type** with special "preserve_legacy" behavior
- **Rich metadata** tracking migration source and user details

## How It Works

### 1. Role Assignment (Unified Flow)

When a user verifies and gets a role, the system now uses a single table:

```typescript
// All role tracking goes through verifier_user_roles (enhanced)
await this.dbSvc.trackRoleAssignment({
  userId,
  serverId,
  roleId,
  ruleId,
  address,
  userName: member.displayName,
  serverName: guild.name,
  roleName: role.name
});

// Legacy compatibility maintained for existing flows
await this.dbSvc.addServerToUser(userId, serverId, roleName, address);
```

### 2. Scheduled Re-verification

Every 6 hours, the system:

1. **Fetches active assignments**: Gets all users with active roles from verifier_user_roles
2. **Checks grace periods**: Respects 72-hour grace period for legacy migrated data
3. **Verifies holdings**: Checks if user still meets ethscription criteria
4. **Updates or revokes**: Either updates last_verified_at or revokes the role
5. **Removes Discord roles**: Actually removes the role from Discord
6. **Logs results**: Provides detailed logging of the process with migration context

### 3. Manual Verification

Admins can trigger manual verification:

```typescript
// Re-verify specific user
const result = await dynamicRoleService.reverifyUser(userId);

// Re-verify all users in a server
const stats = await simpleRoleMonitorService.reverifyServer(serverId);

// Get user role status (includes legacy migration info)
const userStatus = await simpleRoleMonitorService.getUserRoleStatus(userId, serverId);

// Check migration status
const migrationStats = await dbService.getRoleAssignmentStats();
```

## Configuration Options

### Verification Frequency

Configure the re-verification schedule using the `DYNAMIC_ROLE_CRON` environment variable:

```bash
# In your .env file

# Every 6 hours (default)
DYNAMIC_ROLE_CRON=0 */6 * * *

# Every 12 hours
DYNAMIC_ROLE_CRON=0 */12 * * *

# Daily at midnight
DYNAMIC_ROLE_CRON=0 0 * * *

# Every 4 hours
DYNAMIC_ROLE_CRON=0 */4 * * *

# Every 30 minutes (for testing)
DYNAMIC_ROLE_CRON=*/30 * * * *
```

The CRON expression follows standard format:
- `minute hour day-of-month month day-of-week`
- Use [crontab.guru](https://crontab.guru/) for help creating expressions

### Batch Size

Adjust batch processing in `DynamicRoleService`:

```typescript
const batchSize = 10; // Current default
// Increase for faster processing (risk rate limits)
// Decrease for more conservative approach
```

### Grace Period Configuration

The system includes grace period handling for legacy users:

```typescript
// 72-hour grace period for migrated legacy data
// Configured during migration, affects role removal logic
// Legacy users get additional time before first re-verification
```

### Role Expiration

Add expiration when tracking roles:

```typescript
await this.dbSvc.trackRoleAssignment({
  // ... other fields
  expiresInHours: 720 // 30 days
});
```

## Monitoring and Maintenance

### 1. Check System Health

```typescript
// Get overall statistics (includes migration data)
const stats = await dbService.getRoleAssignmentStats();
// Returns: { total, active, expired, revoked, byServer, legacyCount }

// Check assignments expiring soon
const expiring = await dbService.getExpiringSoonAssignments();

// Monitor migration progress
const migrationStatus = await dbService.getUserRoleHistory(userId, serverId);
```

### 2. Manual Interventions

```typescript
// Force re-verification for specific user
await dynamicRoleService.reverifyUser(userId);

// Get user's role history (includes legacy migration info)
const history = await dbService.getUserRoleHistory(userId, serverId);

// Check if user is still in server
const inServer = await discordVerificationService.isUserInServer(userId, serverId);

// Find specific role assignments
const assignment = await dbService.findUserRoleAssignment(userId, serverId, roleId);
```

### 3. Migration Validation

Use the provided verification queries:

```sql
-- Check migration results (from 20250706000005_verify_migration_results.sql)
-- These queries help validate the migration was successful
-- and all legacy data was properly transferred
```

### 3. Logs to Monitor

- `🔄 Starting scheduled role re-verification`
- `⏳ Grace period active for legacy user` (during migration period)
- `✅ User still qualifies for role`
- `🚫 Revoked role from user`
- `📊 Legacy migration: X users processed`
- `🏁 Re-verification complete: X verified, Y revoked, Z errors`

## Best Practices

### 1. Migration and Rollout
- **Run migrations on staging first** to validate the process
- **Monitor grace period behavior** for legacy users during first 72 hours
- **Use verification queries** to validate migration success
- **Test with enhanced tracking** before full production deployment

### 2. Performance Considerations
- **Single table design** improves query performance and simplifies maintenance
- **Proper indexing** on status, verified_at, and user/server combinations
- **Batching and rate limiting** prevent Discord API overuse
- **Consider running during off-peak hours** for large re-verification cycles

### 3. Error Handling
- **Graceful degradation** if enhanced features fail
- **Grace period handling** prevents immediate role removal for legacy users
- **Discord API error recovery** with retry logic
- **User cleanup** for members who left servers

### 4. Data Integrity
- **Migration preserves all legacy data** with rich metadata
- **Referential integrity** maintained with existing rules and servers
- **Legacy rule type** ensures special handling for migrated data
- **Comprehensive logging** for audit trails

## Integration with Existing Flow

The system provides seamless integration through the single-table approach:

1. **Unified role tracking**: All role assignments go through verifier_user_roles (enhanced)
2. **Legacy data preservation**: Existing data migrated with full context and grace periods
3. **API compatibility**: All existing Discord commands and endpoints continue to work
4. **Backward compatibility**: Legacy verification flows still supported during transition
5. **Migration transparency**: Users experience no disruption during the migration process

## Migration Details

### Legacy Data Handling
- **Source tables**: verifier_users and verifier_servers (data preserved, not dropped)
- **Target table**: verifier_user_roles (enhanced with new columns)
- **Migration strategy**: Copy all legacy data with rich metadata and grace periods
- **Grace period**: 72 hours before legacy users face role removal
- **Metadata preservation**: User names, server names, timestamps, and verification details

### Schema Enhancements
The enhanced verifier_user_roles table includes:
- **status**: 'active', 'expired', 'revoked' for state tracking
- **verified_at**: Last successful verification timestamp
- **last_checked**: Last verification attempt timestamp
- **expires_at**: Optional expiration date for roles
- **rule_id**: Link to verification rules for dynamic checking
- **verification_data**: JSON metadata about verification context
- **user_name, server_name, role_name**: Human-readable names for monitoring

## Future Enhancements

Potential improvements you could add:

1. **Notification system**: Notify users when roles are removed (with grace period warnings)
2. **Extended grace periods**: Configurable grace periods for different user types
3. **Migration analytics**: Detailed reporting on migration success and user behavior
4. **Re-verification triggers**: Manual triggers via Discord commands for specific users
5. **Dashboard**: Web interface for monitoring role assignments and migration status
6. **Advanced analytics**: Patterns in role assignment, retention, and migration data
7. **Automated rollback**: Ability to rollback to legacy tables if needed

## Troubleshooting

### Migration Issues
- **Migration not complete**: Check Supabase logs and run verification queries
- **Legacy data missing**: Verify source tables exist and have proper permissions
- **Grace period not working**: Check migration timestamps and legacy rule creation

### Enhanced Table Issues
- **Table not created**: Check if migration ran successfully and verify Supabase permissions
- **Missing columns**: Ensure all migration files ran in correct order
- **Index issues**: Check database logs for performance problems

### Role Management Issues
- **Roles not being removed**: Check Discord bot permissions and user server membership
- **Grace period confusion**: Verify legacy migration status and timestamps
- **Performance problems**: Monitor batch sizes and verification intervals

### Data Validation
Use the verification queries from migration file 20250706000005:
- Check total counts match between legacy and new tables
- Verify all users have appropriate grace periods
- Confirm rule associations are correct

## Security Considerations

- **Data preservation**: Enhanced tracking stores the same data as legacy tables (user IDs, addresses)
- **Migration security**: Legacy data migration preserves privacy while adding metadata
- **Role removal permissions**: Requires proper Discord bot permissions for role management
- **Database access**: Controlled via Supabase RLS policies (if enabled)
- **Audit trail**: Comprehensive logging for compliance and debugging
- **Grace period protection**: Legacy users protected from immediate role removal
- **Sensitive data handling**: Debug logs only at appropriate levels

## Summary

The dynamic role management system has been successfully refactored to use a single-table approach:

✅ **Single table design** using enhanced `verifier_user_roles`  
✅ **Complete legacy migration** with 72-hour grace periods  
✅ **Seamless integration** with existing verification flows  
✅ **Enhanced monitoring** and statistics for role assignments  
✅ **Robust error handling** and performance optimization  
✅ **Comprehensive testing** with all tests passing  
✅ **Migration validation** tools and verification queries  

The system is production-ready and provides a solid foundation for continuous role management while maintaining full backward compatibility with legacy data!

---

**Key Files:**
- `src/services/db.service.ts` - Enhanced database methods
- `src/services/dynamic-role.service.ts` - Scheduled re-verification
- `src/services/simple-role-monitor.service.ts` - Manual verification and monitoring
- `supabase/migrations/20250706000001_*.sql` - Database migration files
- Test files with comprehensive coverage

**Next Steps:**
1. Deploy migrations to production
2. Monitor grace period behavior for legacy users
3. Use verification queries to validate migration success
4. Consider additional enhancements based on usage patterns
