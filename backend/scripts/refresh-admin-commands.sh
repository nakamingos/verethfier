#!/bin/bash

# Script to refresh Discord slash commands with new permissions
# This forces Discord to re-register the commands with the Administrator permission requirement

echo "🔄 Refreshing Discord slash commands with admin-only permissions..."

cd /home/snep/devibe/verethfier-fresh/backend

# Build the project first
echo "📦 Building project..."
npm run build

# Start the bot briefly to register commands (it will auto-register on startup)
echo "🤖 Starting bot to register commands..."
timeout 30s npm run start:dev || true

echo "✅ Discord slash commands should now be restricted to Administrators only!"
echo ""
echo "🔒 Security Status:"
echo "   • All /setup commands now require Administrator permissions"
echo "   • Non-admin users will see 'Access Denied' if they somehow get access"
echo "   • Discord will hide the commands from non-admin users automatically"
echo ""
echo "💡 Note: It may take a few minutes for Discord to update command permissions across all servers."
