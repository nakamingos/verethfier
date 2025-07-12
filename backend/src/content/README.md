# Content Directory

This directory contains static content and text used throughout the application, separated from business logic for better maintainability.

## Files

### `setup-help.content.ts`
Contains all text content for the `/setup help` Discord command embed. This includes:
- Command descriptions and examples
- Pro tips and troubleshooting guides
- Workflow examples
- Embed formatting configuration

## Benefits of This Approach

1. **Easy Editing**: Non-developers can easily update help text without touching service logic
2. **Maintainability**: Clear separation between content and functionality
3. **Localization Ready**: Structure supports future internationalization
4. **Version Control**: Content changes are clearly visible in git diffs
5. **Reusability**: Content can be reused across different services if needed

## Usage Pattern

```typescript
import { SETUP_HELP_CONTENT } from '@/content/setup-help.content';

// Use in embed creation
const embed = new EmbedBuilder()
  .setColor(SETUP_HELP_CONTENT.color)
  .setTitle(SETUP_HELP_CONTENT.title)
  .addFields(SETUP_HELP_CONTENT.fields);
```

## Adding New Content Files

When adding new content files:
1. Follow the naming pattern: `{feature}-{type}.content.ts`
2. Export interfaces for type safety
3. Use proper Discord.js types (e.g., `number` for colors, not hex strings)
4. Document the content structure in this README
