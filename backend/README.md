# Verethfier Backend

NestJS API server for Discord bot with Ethscriptions verification.

## 🏗️ Tech Stack

- **NestJS** with TypeScript
- **Supabase** PostgreSQL database
- **Discord API** integration
- **Jest** for testing

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Yarn
- Supabase account
- Discord bot token

### Setup
```bash
yarn install
cp env.example .env
# Edit .env with your credentials
yarn start:dev
```

### Environment Variables
Create `.env` with:
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_discord_client_id
```

### Database Setup
```bash
npx supabase start
npx supabase migration up
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── services/         # Business logic
│   ├── models/           # Database models
│   ├── config/           # Configuration
│   └── constants/        # App constants
├── test/                 # Test suites
└── supabase/            # Database migrations
```

## 🔧 Features

- **Discord Bot** - Slash commands and role management
- **Wallet Verification** - EIP-712 signature verification
- **Role Assignment** - Automatic role management based on NFT ownership
- **Caching** - Performance optimization with caching layer

## 📜 Scripts

```bash
yarn start:dev        # Development server
yarn start:prod       # Production server
yarn test             # Run all tests
yarn build            # Build for production
yarn migration:run    # Run database migrations
```

## 🧪 Testing

```bash
yarn test             # Run all test suites
yarn test:coverage    # Run with coverage report
```

## 📚 Documentation

- [Main README](../README.md) - Project overview
- [Frontend README](../frontend/README.md) - Frontend documentation
- [Documentation](../docs/) - Additional guides
