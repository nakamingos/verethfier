# Verethfier

A Discord bot for Ethscriptions-based role verification using wallet connections and collection ownership.

## Features

- 🔗 **Wallet Verification** - Connect Ethereum wallets to Discord accounts
- 🎨 **Ethscriptions Collection Roles** - Assign roles based on Ethscriptions ownership
- ⚡ **Attribute Filtering** - Filter by specific Ethscriptions traits and properties
- 📊 **Minimum Holdings** - Set minimum token requirements for roles
- 🔒 **Secure Authentication** - Wallet signature verification

## Quick Start

### Backend (NestJS + Supabase)

```bash
cd backend
npm install
cp env.example .env
# Configure your .env file
npm run start:dev
```

### Frontend (Angular)

```bash
cd frontend
npm install
npm start
```

### Database Setup

```bash
cd backend
npx supabase start
npx supabase migration up
```

## Project Structure

```
verethfier-fresh/
├── backend/           # NestJS API server
├── frontend/          # Angular web app
├── scripts/           # Utility scripts
└── temp/             # Working files (gitignored)
```

## Environment Variables

Copy `backend/env.example` to `backend/.env` and configure:

- `SUPABASE_KEY` - Your Supabase service key
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application ID

## Available Scripts

### Backend
- `npm run start:dev` - Start development server
- `npm run test` - Run test suite
- `npm run build` - Build for production

### Frontend
- `npm start` - Start development server
- `npm run build` - Build for production

### Utilities
- `node scripts/cleanup-old-commands.js` - Remove old Discord slash commands

## License

[CC0 1.0 Universal](LICENSE) - Public Domain Dedication
