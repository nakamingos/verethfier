#!/bin/bash

# Backend Cleanup Script - Remove unused dependencies and files
# Run this script from the backend directory

echo "🧹 Starting backend cleanup..."

# Remove unused dependencies
echo "📦 Removing unused production dependencies..."
yarn remove @nestjs/passport passport passport-discord passport-local

echo "🔧 Removing unused dev dependencies..."
yarn remove @types/passport-discord @types/passport-local source-map-support ts-loader ts-node tsconfig-paths

# Note: Keeping @types/express, @types/jest, @nestjs/schematics as they might be needed

# Remove legacy test files
echo "🗂️ Removing legacy test files..."
rm -f test-attribute-key-only.js
rm -f test-attribute-value-only.js  
rm -f test-multi-role.js

# Remove backup files
echo "🗃️ Removing backup files..."
rm -f test/data.service.spec.ts.backup
rm -f test/discord.service.spec.ts.backup

echo "✅ Cleanup completed!"
echo ""
echo "📋 Manual tasks remaining:"
echo "  1. Remove redundant dotenv imports from service files"
echo "  2. Remove DISCORD_CLIENT_SECRET from env.example (unused)"
echo "  3. Remove commented HttpModule import from app.module.ts"
echo "  4. Consolidate environment configuration to main.ts only"
echo ""
echo "🧪 Remember to run tests after cleanup:"
echo "  yarn test"
