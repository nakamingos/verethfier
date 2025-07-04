# Verification Recovery Command

## Overview
The `/setup recover-verification` command provides a robust solution for handling cases where Discord verification messages are accidentally deleted from channels that have existing verification rules.

## Problem It Solves
When a verification message with the "Verify Now" button is deleted from a Discord channel, existing rules that reference that message become "orphaned" - they point to a message that no longer exists. This breaks the verification flow for users and can cause significant operational issues.

## How It Works

### Command Usage
```
/setup recover-verification channel:#your-channel
```

### Recovery Process
1. **Detects Orphaned Rules**: Scans all verification rules for the specified channel and identifies those pointing to non-existent messages
2. **Creates New Verification Message**: Generates a new "Wallet Verification" message with "Verify Now" button in the channel
3. **Updates Rule References**: Updates all orphaned rules to point to the new message
4. **Provides Admin Feedback**: Shows detailed results including:
   - New message ID created
   - Number of rules updated
   - Affected roles

### Safety Features
- **Non-Destructive**: Only updates rules that reference deleted messages
- **Validation**: Verifies message existence before considering rules "orphaned"
- **Error Handling**: Graceful failure handling with detailed error messages
- **Admin-Only**: Requires appropriate permissions to execute

### Example Output
When orphaned rules are found and recovered:
```
✅ Verification Recovery Complete

New Message Created: Message ID: 1234567890
Rules Updated: 3/3 rules updated  
Roles Affected: @Verified, @Premium, @Holder
```

When no recovery is needed:
```
ℹ️ No orphaned verification rules found for this channel. 
All existing verification messages appear to be intact.
```

## Technical Implementation

### New Database Method
- `getRulesByChannel(guildId, channelId)`: Retrieves all rules for a specific channel

### Service Integration  
- **DiscordCommandsService**: Handles the recovery command logic
- **DiscordMessageService**: Creates new verification messages and validates existing ones
- **DbService**: Updates rule references to new message IDs

### Error Scenarios Handled
- Channel not found or invalid type
- Database connection issues
- Discord API failures
- Partial update failures (continues with remaining rules)

## Benefits
- **Operational Continuity**: Restores verification functionality quickly
- **Data Integrity**: Preserves existing rule configurations
- **Administrative Visibility**: Clear feedback on what was recovered
- **Minimal Downtime**: Fast recovery process
- **User Experience**: Seamless transition for end users

## Use Cases
- Accidental message deletion by moderators
- Channel cleanup that removes verification messages
- Message corruption or Discord API issues
- Server migration scenarios
- Emergency recovery situations

This command ensures that verification setups remain resilient and can be quickly restored without manual reconfiguration of rules.
