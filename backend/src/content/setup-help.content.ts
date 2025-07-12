/**
 * Setup Help Content
 * 
 * Contains all text content for the /setup help command.
 * This file centralizes help text for easy editing and maintenance.
 */

export interface HelpField {
  name: string;
  value: string;
  inline: boolean;
}

export interface SetupHelpContent {
  title: string;
  description: string;
  fields: HelpField[];
  footer: string;
  color: number;
}

export const SETUP_HELP_CONTENT: SetupHelpContent = {
  title: '🔧 Verification Setup Help',
  description: 'Complete guide to setting up and managing Ethscription verification rules for your server.',
  color: 0xc3ff00, // Bright yellow for visibility
  footer: 'Need more help? Check the docs or ask in support channels',
  fields: [
    {
      name: '📝 `/setup add-rule`',
      value: '**Create new verification rules**\n' +
             '• **Channel**: Where users will verify\n' +
             '• **Role**: Role to assign (existing or new)\n' +
             '• **Collection**: Specific collection slug or "ALL"\n' +
             '• **Attribute**: Trait filtering (optional)\n' +
             '• **Min Items**: Minimum holdings required\n' +
             '**Example**: `/setup add-rule #verify @Holder misprint-mingos attribute_key=Type attribute_value=Stork 1`\n\n',
      inline: false
    },
    {
      name: '🗑️ `/setup remove-rule`',
      value: '**Remove existing verification rules**\n' +
             '• **Rule ID**: Single ID (e.g., `5`) or multiple (`1,2,3`)\n' +
             '• Use `/setup list-rules` to find rule IDs\n' +
             '• Includes undo functionality\n' +
             '**Example**: `/setup remove-rule 1,3,5`\n\n',
      inline: false
    },
    {
      name: '📋 `/setup list-rules`',
      value: '**View all verification rules**\n' +
             '• Shows rule IDs, channels, roles, and criteria\n' +
             '• Organized by channel for easy reading\n' +
             '• Use rule IDs for removal\n' +
             '**Example**: `/setup list-rules`\n\n',
      inline: false
    },
    {
      name: '🔄 `/setup recover-verification`',
      value: '**Fix broken verification setups**\n' +
             '• Recreates verification messages\n' +
             '• Updates orphaned rules\n' +
             '• Use when verification buttons stop working\n' +
             '**Example**: `/setup recover-verification #verify`\n\n',
      inline: false
    },
    {
      name: '💡 **Pro Tips**',
      value: '• **Autocomplete**: Type to see available options\n' +
             '• **Role Creation**: Type new role names to create them\n' +
             '• **Duplicate Rules**: Bot warns about conflicts\n' +
             '• **Undo System**: Most actions can be undone\n' +
             '• **Case Sensitivity**: Role names preserve your casing',
      inline: false
    },
    {
      name: '⚠️ **Common Issues & Solutions**',
      value: '**"Role hierarchy issue"** → Move bot role higher\n' +
             '**"Verification not working"** → Use recover-verification\n' +
             '**"Duplicate role warning"** → Decide if intentional\n' +
             '**"Rule not found"** → Check with list-rules first\n' +
             '**"Permission denied"** → Ensure admin permissions',
      inline: false
    },
    {
      name: '🔧 **Workflow Example**',
      value: '1. `/setup add-rule #verify @Holder misprint-mingos`\n' +
             '2. `/setup list-rules` (to check what was created)\n' +
             '3. `/setup add-rule #verify @RareHolder misprint-mingos attribute_value=Stork`\n' +
             '4. Test verification in the channel\n' +
             '5. Use `/setup remove-rule` if changes needed',
      inline: false
    }
  ]
};
