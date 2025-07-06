# Verethfier

A Discord bot for Ethscriptions-based role verification using wallet connections and collection ownership.

## 🚀 Features

- 🔗 **Wallet Verification** - Connect Ethereum wallets to Discord accounts  
- 🎨 **Ethscriptions Collection Roles** - Assign roles based on Ethscriptions ownership
- ⚡ **Attribute Filtering** - Filter by specific Ethscriptions traits and properties
- 📊 **Minimum Holdings** - Set minimum token requirements for roles
- � **Dynamic Role Management** - Automatic role assignment/removal based on current holdings
- �🔒 **Secure Authentication** - Wallet signature verification
- ⏰ **Scheduled Re-verification** - Continuous monitoring of user holdings

## 🏗️ Architecture

This project uses a **monorepo structure** with separate backend and frontend applications:

- **Backend**: NestJS API server with Supabase database
- **Frontend**: Angular web application for wallet connection and verification
- **Database**: Supabase PostgreSQL with real-time capabilities
- **External Data**: Ethscriptions marketplace API integration

## 📁 Project Structure

```
verethfier-fresh/
├── backend/           # NestJS API server
│   ├── src/          # Source code
│   ├── test/         # Test suites
│   ├── supabase/     # Database migrations
│   └── scripts/      # Utility scripts
├── frontend/          # Angular web app  
│   ├── src/          # Source code
│   └── dist/         # Build output
├── docs/             # Documentation
└── temp/             # Working files (gitignored)
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Yarn package manager
- Supabase account
- Discord application/bot

### 1. Backend Setup

```bash
cd backend
yarn install
cp env.example .env
# Configure your .env file (see Environment Variables section)
yarn start:dev
```

### 2. Frontend Setup  

```bash
cd frontend
yarn install
yarn start
```

### 3. Database Setup

```bash
cd backend
npx supabase start
npx supabase migration up
```

For detailed migration information, see `backend/supabase/migrations/README.md`.

## ⚙️ Environment Variables

Copy `backend/env.example` to `backend/.env` and configure:

### Required Variables
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase service key  
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application ID
- `DISCORD_PUBLIC_KEY` - Discord public key for verification

### Optional Variables
- `NODE_ENV` - Environment mode (development/production)
- `PORT` - Server port (default: 3000)
- `FRONTEND_URL` - Frontend URL for CORS (default: http://localhost:4200)

## 📜 Available Scripts

### Backend
- `yarn start:dev` - Start development server with hot reload
- `yarn start:prod` - Start production server
- `yarn test` - Run test suite  
- `yarn test:cov` - Run tests with coverage report
- `yarn build` - Build for production
- `yarn migration:run` - Run database migrations

### Frontend  
- `yarn start` - Start development server
- `yarn build` - Build for production
- `yarn test` - Run unit tests
- `yarn e2e` - Run end-to-end tests

## 📚 Documentation

- [Dynamic Role Management](docs/DYNAMIC_ROLE_MANAGEMENT.md) - Implementation guide for dynamic role features
- [Security Audit](docs/SECURITY_AUDIT.md) - Security improvements and best practices
- [Migration Guide](backend/supabase/migrations/README.md) - Database migration instructions

## 🧪 Testing

The project maintains high test coverage with comprehensive test suites:

```bash
# Run all backend tests
cd backend && yarn test

# Run tests with coverage
cd backend && yarn test:cov

# Run specific test suite
cd backend && yarn test discord-commands.service.spec.ts
```

## 🚀 Deployment

### Backend Deployment
1. Build the application: `yarn build`
2. Set production environment variables
3. Run migrations: `yarn migration:run`
4. Start: `yarn start:prod`

### Frontend Deployment
1. Build: `yarn build`
2. Deploy `dist/` folder to your hosting service

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

[CC0 1.0 Universal](LICENSE) - Public Domain Dedication
