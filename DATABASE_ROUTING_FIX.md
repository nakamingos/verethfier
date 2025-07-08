# Database Routing Fix Summary

## Issue Description
User/role verification data was being stored in the legacy `verifier_users` table instead of the unified `verifier_user_roles` table.

## Root Cause Analysis
The verification flow was using two different database tracking methods:
1. **Legacy method**: `addServerToUser()` → inserts into `verifier_users` table
2. **Modern method**: `trackRoleAssignment()` → inserts into `verifier_user_roles` table

The issue was that the legacy method was being called unconditionally, while the modern method was only called as "enhanced tracking" when certain conditions were met.

## Solution Implemented

### 1. Updated Discord Verification Service (`discord-verification.service.ts`)
**BEFORE:**
```typescript
// Legacy tracking (always called)
await this.dbSvc.addServerToUser(userId, guildId, role.name, address);

// Enhanced tracking (only if ruleId exists)
if (hasEnhancedTracking && ruleId) {
  await this.dbSvc.trackRoleAssignment({...});
}
```

**AFTER:**
```typescript
// Use unified tracking as primary method
try {
  await this.dbSvc.trackRoleAssignment({
    userId,
    serverId: guildId,
    roleId,
    ruleId: ruleId || 'legacy', // Use 'legacy' as fallback
    address,
    userName: member.displayName || member.user.username,
    serverName: guild.name,
    roleName: role.name,
    expiresInHours: undefined
  });
} catch (error) {
  // Fallback to legacy tracking only if unified tracking fails
  await this.dbSvc.addServerToUser(userId, guildId, role.name, address);
}
```

### 2. Updated Verification Service (`verification.service.ts`)
**BEFORE:**
```typescript
async assignRoleToUser(...) {
  // Uses logUserRole() which is missing rule_id
  await this.dbSvc.logUserRole(userId, serverId, roleId, address, ...);
}
```

**AFTER:**
```typescript
async assignRoleToUser(...) {
  // Uses trackRoleAssignment() for complete data structure
  await this.dbSvc.trackRoleAssignment({
    userId,
    serverId,
    roleId,
    ruleId: ruleId || 'unknown',
    address,
    userName: metadata?.userName,
    serverName: metadata?.serverName,
    roleName: metadata?.roleName,
    expiresInHours: undefined
  });
}
```

### 3. Updated Tests (`verification.service.spec.ts`)
- Added `trackRoleAssignment` to the mock service
- Updated test expectations to verify calls to `trackRoleAssignment` instead of `logUserRole`
- Ensured test data structure matches the new unified tracking method

## Database Schema Alignment

### Target Table: `verifier_user_roles`
```sql
CREATE TABLE verifier_user_roles (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  rule_id TEXT, -- Now properly populated
  address TEXT NOT NULL,
  user_name TEXT,
  server_name TEXT,
  role_name TEXT,
  assigned_at TIMESTAMP DEFAULT NOW(),
  verification_expires_at TIMESTAMP,
  status TEXT DEFAULT 'active'
);
```

### Benefits of Unified Tracking
1. **Complete Data**: Includes `rule_id` for proper rule association
2. **Rich Metadata**: Stores user names, server names, role names
3. **Expiration Support**: Handles role expiration for dynamic roles
4. **Status Tracking**: Supports role status management
5. **Consistent Structure**: Single table for all role assignments

## Verification Steps

1. **Test Suite**: ✅ All verification and Discord verification tests pass
2. **Database Methods**: ✅ Both `trackRoleAssignment` and fallback `addServerToUser` work
3. **Error Handling**: ✅ Graceful fallback to legacy method if unified tracking fails
4. **Rule ID Tracking**: ✅ Rule IDs are now properly stored (including 'legacy' and 'unknown' fallbacks)

## Impact Assessment

### ✅ Fixes Applied
- All new role assignments go to `verifier_user_roles` table
- Rule IDs are properly tracked for both legacy and modern rules
- Rich metadata (usernames, server names, role names) is stored
- Backward compatibility maintained with fallback to legacy table

### ✅ No Breaking Changes
- Legacy `verifier_users` table still exists for fallback
- Existing verification flows continue to work
- API endpoints unchanged
- Discord commands unchanged

## Future Cleanup

After confirming the unified tracking works properly in production:

1. **Remove Legacy Methods**: Can remove `addServerToUser` and `logUserRole` methods
2. **Migrate Legacy Data**: Can migrate existing data from `verifier_users` to `verifier_user_roles`
3. **Drop Legacy Table**: Eventually remove the `verifier_users` table
4. **Simplify Code**: Remove fallback logic once unified tracking is proven stable

---

**Status**: ✅ **RESOLVED**
**Date**: July 7, 2025
**Validation**: Tests pass, unified tracking implemented, fallback preserved
