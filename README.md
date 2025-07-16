# Verethfier

A Discord bot for Ethscriptions-based role verification using wallet connections and collection ownership.

## 🚀 Features

- 🔗 **Wallet Verification** - Connect Ethereum wallets to Discord accounts  
- 🎨 **Collection Role Assignment** - Assign roles based on Ethscriptions ownership
- ⚡ **Attribute Filtering** - Filter by specific traits and properties
- 📊 **Minimum Holdings** - Set minimum token requirements
- 🔄 **Dynamic Role Management** - Automatic role assignment/removal
- 🔒 **Secure Authentication** - Wallet signature verification

## 🏗️ Tech Stack

- **Backend**: NestJS + TypeScript + Supabase
- **Frontend**: Angular + TypeScript  
- **Database**: PostgreSQL (Supabase)
- **APIs**: Discord API + Ethscriptions Marketplace

## 📁 Project Structure

```
verethfier-fresh/
├── backend/           # NestJS API server
├── frontend/          # Angular web app
├── docs/              # Documentation
└── README.md          # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Yarn
- Supabase account
- Discord bot

### Setup
```bash
# 1. Backend
cd backend
yarn install
cp env.example .env
# Edit .env with your credentials
yarn start:dev

# 2. Frontend  
cd frontend
yarn install
yarn start

# 3. Database
cd backend
npx supabase start
npx supabase migration up
```

## ⚙️ Environment Variables

Copy `backend/env.example` to `backend/.env` and configure:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_discord_client_id
```

## 📜 Scripts

```bash
# Backend
yarn start:dev        # Development server
yarn test             # Run tests
yarn build            # Build for production

# Frontend  
yarn start            # Development server
yarn build            # Build for production
```

## 📚 Documentation

- [Backend README](backend/README.md) - API and backend documentation
- [Frontend README](frontend/README.md) - Frontend setup and usage
- [Documentation](docs/) - Additional guides and documentation

## � Testing

```bash
cd backend
yarn test             # Run all tests
```

## 📄 License

[CC0 1.0 Universal](LICENSE) - Public Domain
