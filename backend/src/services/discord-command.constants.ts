/**
 * Discord Command Constants
 * 
 * Centralized constants for Discord command processing and unified rule management.
 */

export const DISCORD_COMMAND_CONSTANTS = {
  // Rule limits
  MAX_RULES_PER_CHANNEL: 10,
  MAX_RULES_PER_GUILD: 100,
  
  // Role configuration
  DEFAULT_ROLE_COLOR: 'Blue' as const,
  ROLE_POSITION_OFFSET: 1, // How many positions below bot role to create new roles
  
  // Timeouts and delays
  DUPLICATE_WARNING_TIMEOUT: 300000, // 5 minutes
  INTERACTION_TIMEOUT: 15000, // 15 seconds
  
  // Message limits
  MAX_EMBED_DESCRIPTION_LENGTH: 4096,
  MAX_EMBED_FIELD_VALUE_LENGTH: 1024,
  
  // Rule validation
  MIN_ITEMS_DEFAULT: 1,
  MIN_ITEMS_MAX: 1000,
  
  // Error messages
  ERRORS: {
    CHANNEL_REQUIRED: 'Channel and role are required.',
    RULE_ID_REQUIRED: 'Rule ID is required.',
    EXACT_DUPLICATE: 'This exact rule already exists!',
    ROLE_HIERARCHY_ISSUE: 'Role is positioned higher than the bot\'s role and cannot be managed.',
    DUPLICATE_ROLE_NAME: 'A role with this name already exists in this server.',
    RULE_CREATION_FAILED: 'Failed to create the verification rule.',
    ROLE_CREATION_FAILED: 'Failed to create the Discord role.',
    RULE_DELETION_FAILED: 'Failed to delete the rule. Please try again.',
    RULE_REMOVAL_FAILED: 'Failed to remove the verification rule.',
  },
  
  // Success messages
  SUCCESS: {
    RULE_CREATED: 'Verification rule created successfully!',
    RULE_DELETED: 'Rule deleted successfully.',
    ROLE_CREATED: 'Created new role',
  },
  
  // Warning messages
  WARNINGS: {
    DUPLICATE_RULE: 'A similar rule already exists with different criteria.',
    ROLE_LIMIT_APPROACHING: 'This server is approaching the maximum number of verification rules.',
  }
} as const;

/**
 * Default rule criteria values
 */
export const DEFAULT_RULE_CRITERIA = {
  SLUG: 'ALL',
  ATTRIBUTE_KEY: 'ALL',
  ATTRIBUTE_VALUE: 'ALL',
  MIN_ITEMS: 1
} as const;
