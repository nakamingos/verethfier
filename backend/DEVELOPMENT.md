# Development Setup Guide

## 🏗️ Environment Configuration

This project supports multiple environments with separate configuration files:

### Environment Files

- **`.env`** - Your active local configuration (gitignored)
- **`.env.development`** - Template for local development with local Supabase
- **`.env.test`** - Used by Jest tests (gitignored, auto-loads during tests)
- **`.env.production.example`** - Template for production deployment
- **`env.example`** - Basic template for quick setup

### Port Configuration

To avoid conflicts with other Supabase projects, this project uses custom ports:

| Service | Port | URL |
|---------|------|-----|
| API (Kong) | 54331 | http://localhost:54331 |
| Database | 54332 | postgresql://postgres:postgres@localhost:54332/postgres |
| Studio (UI) | 54333 | http://localhost:54333 |
| Email Testing | 54334 | http://localhost:54334 |

**Note:** Default Supabase ports are 54321-54324. If you have other projects using those, this configuration prevents conflicts.

## 🚀 Getting Started

### 1. Install Dependencies

```bash
cd backend
yarn install
```

### 2. Set Up Local Database

```bash
# Start local Supabase (uses ports 54331-54334)
supabase start

# Apply migrations
supabase db reset
```

This will:
- Start PostgreSQL on port 54332
- Start API server on port 54331
- Start Studio UI on port 54333
- Create all tables and functions from migrations

### 3. Configure Environment

```bash
# Copy development template
cp .env.development .env

# Edit .env and add your Discord bot credentials
# For development, create a SEPARATE Discord bot (not your production one!)
```

**Important:** Create a separate Discord development bot:
1. Go to https://discord.com/developers/applications
2. Create NEW Application (e.g., "Verethfier Dev")
3. Create Bot and copy token
4. Invite to your TEST Discord server (not production!)

### 4. Run the Bot

```bash
# Development mode (with hot reload)
yarn start:dev

# Production mode
yarn build
yarn start:prod
```

## 🧪 Testing

Tests automatically use `.env.test` configuration:

```bash
# Run all tests
yarn test

# Run with coverage
yarn test:coverage

# Run specific test file
yarn test cache.service.spec.ts

# Verbose output for debugging
yarn test:verbose
```

## 🔧 Multiple Supabase Projects

If you're running multiple projects with local Supabase:

### Check Running Containers
```bash
docker ps | grep supabase
```

### View This Project's Supabase Status
```bash
cd backend
supabase status
```

### Stop/Start This Project's Supabase
```bash
supabase stop   # Stops this project's containers
supabase start  # Starts this project's containers
```

### Switch Between Projects
Each project's Supabase runs independently with unique container names:
- This project: `supabase_db_backend`, `supabase_kong_backend`, etc.
- Other projects: `supabase_db_<project>`, `supabase_kong_<project>`, etc.

You can run multiple projects simultaneously since they use different ports!

## 📋 Development Workflow Best Practices

### 1. Never Test on Production Server
- ❌ Don't use your production Discord bot for testing
- ❌ Don't test commands on your production Discord server
- ✅ Create separate dev bot and test server

### 2. Use Local Database
- ✅ Test against local Supabase (port 54331)
- ✅ Run migrations locally first
- ✅ Use test data, not real user data

### 3. Environment Separation
```bash
# Development (local)
NODE_ENV=development yarn start:dev

# Production (deployed)
NODE_ENV=production yarn start:prod
```

## 🗄️ Database Management

### View Database
```bash
# Open Studio UI
open http://localhost:54333

# Or connect via psql
psql postgresql://postgres:postgres@localhost:54332/postgres
```

### Create Migration
```bash
supabase migration new migration_name
```

### Apply Migrations
```bash
# Local
supabase db reset

# Production (via Supabase Dashboard)
# Go to Database → Migrations → Run migration
```

### Reset Database
```bash
supabase db reset  # Drops all data and re-runs migrations
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :54331

# Stop all Supabase containers
docker stop $(docker ps -q --filter name=supabase)
```

### Can't Connect to Database
```bash
# Check Supabase status
supabase status

# Restart Supabase
supabase stop
supabase start
```

### Tests Failing
```bash
# Ensure test database is running
supabase start

# Check .env.test has correct ports (54331)
cat .env.test

# Run with verbose output
yarn test:verbose
```

### Discord Bot Not Responding
1. Check bot token in `.env`
2. Verify bot has correct permissions
3. Check bot is invited to your test server
4. Look at console logs for errors

## 📚 Additional Resources

- [Supabase Local Development](https://supabase.com/docs/guides/local-development)
- [Discord.js Guide](https://discordjs.guide/)
- [NestJS Documentation](https://docs.nestjs.com/)
