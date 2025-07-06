# Verethfier Backend

NestJS-based Discord bot for Ethscriptions-based role verification.

## 🏗️ Architecture

- **Framework**: NestJS with TypeScript
- **Database**: Supabase (PostgreSQL)
- **External APIs**: Discord API, Ethscriptions Marketplace
- **Authentication**: Wallet signature verification
- **Role Management**: Dynamic assignment/removal based on holdings

## 📁 Project Structure

```
backend/
├── src/
│   ├── services/         # Core business logic
│   │   ├── data.service.ts          # Ethscriptions data queries
│   │   ├── db.service.ts            # Database operations
│   │   ├── discord-*.service.ts     # Discord bot services
│   │   ├── dynamic-role.service.ts  # Dynamic role management
│   │   └── wallet.service.ts        # Wallet verification
│   ├── models/           # TypeScript interfaces
│   ├── dtos/            # Data transfer objects
│   └── constants/       # Application constants
├── test/                # Test suites (83%+ coverage)
├── supabase/
│   └── migrations/      # Database migrations
└── scripts/             # Utility scripts
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Yarn package manager
- Supabase project
- Discord application

### Installation
```bash
yarn install
```

### Environment Setup
```bash
cp env.example .env
# Edit .env with your configuration
```

### Database Migration
```bash
# Start local Supabase (optional)
npx supabase start

# Run migrations
yarn migration:run
```

### Development
```bash
yarn start:dev
```

## ⚙️ Environment Variables

### Required
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service role key
- `DISCORD_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application ID
- `DISCORD_PUBLIC_KEY` - Discord public key

### Optional
- `NODE_ENV` - development/production
- `PORT` - Server port (default: 3000)
- `FRONTEND_URL` - Frontend URL for CORS

## 🧪 Testing

High test coverage with comprehensive test suites:

```bash
# Run all tests
yarn test

# Run with coverage
yarn test:cov

# Run specific tests
yarn test discord-commands.service.spec.ts

# Watch mode
yarn test:watch
```

### Test Coverage
- Overall: 83%+
- Core services: 90%+
- All 290+ tests passing

## 📜 Available Scripts

- `yarn start` - Start production server
- `yarn start:dev` - Development with hot reload
- `yarn start:debug` - Debug mode
- `yarn build` - Build for production
- `yarn test` - Run test suite
- `yarn test:cov` - Tests with coverage
- `yarn migration:run` - Run database migrations
- `yarn lint` - ESLint checking
- `yarn format` - Prettier formatting

## 🔧 Key Services

### DataService
Handles Ethscriptions marketplace queries with filtering by:
- Collection slug
- Attribute key/value pairs  
- Minimum holdings count
- Owner address verification

### DynamicRoleService
Manages automatic role assignment/removal:
- Scheduled re-verification
- Grace period handling
- Legacy data migration
- Status tracking

### DiscordService
Discord bot functionality:
- Slash command handling
- Role assignment/removal
- Server member management
- Error handling and logging

### WalletService
Wallet verification:
- Signature validation
- Nonce management
- Address verification

## 🗄️ Database Schema

### Core Tables
- `verifier_user_roles` - Unified role tracking with status, timestamps
- `verifier_rules` - Role assignment rules with collection/attribute criteria
- `nonces` - Wallet verification nonces

### Migration Support
- Legacy data migration from old schema
- 72-hour grace period for existing users
- Seamless transition to enhanced tracking

## 🚀 Deployment

### Production Build
```bash
yarn build
```

### Environment Setup
- Set production environment variables
- Configure CORS allowlist
- Set up SSL/TLS certificates

### Database Migration
```bash
yarn migration:run
```

### Process Management
```bash
# Using PM2
pm2 start dist/main.js --name verethfier-backend

# Using Docker
docker build -t verethfier-backend .
docker run -p 3000:3000 verethfier-backend
```

## 🔒 Security Features

- Helmet security headers
- CORS with strict allowlist
- Rate limiting with ThrottlerModule
- Input validation with ValidationPipe
- Secure error handling
- Dependency vulnerability monitoring

## 📊 Monitoring & Logging

- Structured logging with context
- Error tracking and reporting
- Performance monitoring
- Database query optimization
- Discord API rate limit handling

## 🤝 Contributing

1. Follow TypeScript and NestJS best practices
2. Maintain test coverage above 80%
3. Use descriptive commit messages
4. Add tests for new features
5. Update documentation as needed

## 📚 Documentation

- [Dynamic Role Management](../docs/DYNAMIC_ROLE_MANAGEMENT.md)
- [Security Audit Report](../docs/SECURITY_AUDIT.md)
- [Migration Guide](supabase/migrations/README.md)
