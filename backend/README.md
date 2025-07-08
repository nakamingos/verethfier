# Verethfier Backend

NestJS-based Discord bot for Ethscriptions-based role verification with unified verification engine.

## 🏗️ Architecture

- **Framework**: NestJS with TypeScript
- **Database**: Supabase (PostgreSQL) with optimized schema
- **External APIs**: Discord API, Ethscriptions Marketplace
- **Authentication**: EIP-712 wallet signature verification
- **Role Management**: Dynamic assignment/removal with continuous monitoring
- **Caching**: Redis-compatible caching with TTL management
- **Security**: Rate limiting, input validation, secure error handling

## 🎯 Key Features

- **Unified Verification Engine**: Transparent handling of both legacy and modern verification rules
- **Channel-Based Verification**: Simplified verification flow based on Discord channels (no message tracking)
- **Dynamic Role Management**: Automatic role assignment/removal with scheduled re-verification
- **High Performance**: Optimized database queries with caching layer
- **Comprehensive Testing**: 83%+ test coverage with integration and unit tests
- **Security First**: Multiple layers of protection including rate limiting and input validation

## 📁 Project Structure

```
backend/
├── src/
│   ├── services/         # Core business logic
│   │   ├── data.service.ts              # Ethscriptions data queries
│   │   ├── db.service.ts                # Database operations
│   │   ├── discord-*.service.ts         # Discord bot services
│   │   ├── verification-engine.service.ts # Unified verification engine
│   │   ├── dynamic-role.service.ts      # Automatic role management
│   │   ├── cache.service.ts             # Caching layer
│   │   └── wallet.service.ts            # EIP-712 signature verification
│   ├── models/           # TypeScript interfaces and types
│   ├── dtos/            # Data transfer objects with validation
│   ├── config/          # Environment configuration
│   └── constants/       # Application constants
├── test/                # Comprehensive test suites (83%+ coverage)
├── supabase/
│   └── migrations/      # Database migrations with legacy support
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

## 🔧 Core Services

### VerificationEngine (New Unified Engine)
Central verification engine that transparently handles both legacy and modern verification rules:
- **Unified API**: Single entry point for all verification types
- **Smart Detection**: Automatically identifies rule type (legacy vs modern)
- **Performance Optimized**: Efficient database queries with caching
- **Comprehensive Logging**: Detailed verification flow tracking

### DataService
Handles Ethscriptions marketplace queries with advanced filtering:
- Collection slug-based verification
- Attribute key/value pair matching
- Minimum holdings count requirements
- Marketplace escrow support (considers assets in escrow as owned)
- Owner address verification with case-insensitive matching

### DynamicRoleService
Automated role management with continuous monitoring:
- **Scheduled Re-verification**: Configurable intervals for role validation
- **Automatic Cleanup**: Removes roles when holdings no longer meet criteria
- **Grace Period Handling**: Supports transition periods for rule changes
- **Rate Limit Aware**: Respects Discord API limits during bulk operations
- **Legacy Migration**: Seamless transition from old to new role tracking

### DiscordService
Comprehensive Discord bot integration:
- **Slash Command System**: Modern Discord interactions
- **Role Management**: Assignment, removal, and permission handling
- **Autocomplete Support**: Dynamic role selection with server context
- **Error Recovery**: Graceful handling of Discord API failures
- **Multi-Server Support**: Manages multiple Discord servers simultaneously

### CacheService
High-performance caching layer:
- **Smart TTL Management**: Different cache durations for different data types
- **Memory Efficient**: Automatic cache cleanup and size management
- **Error Resilient**: Graceful fallback when cache is unavailable
- **Typed Interface**: Full TypeScript support with generic methods

### WalletService
Secure wallet verification using modern standards:
- **EIP-712 Signatures**: Industry-standard typed data signing
- **Nonce Management**: Prevents replay attacks
- **Expiry Validation**: Time-based verification windows
- **Address Recovery**: Cryptographic proof of wallet ownership

## 🗄️ Database Schema

### Modern Schema (Channel-Based Architecture)
- **`verifier_user_roles`** - Unified role tracking with comprehensive status and timestamp fields
- **`verifier_rules`** - Channel-based verification rules with attribute filtering
- **`nonces`** - Secure verification nonce management with expiry

### Legacy Migration Support
- **Automatic Detection**: Seamlessly handles legacy data during transition
- **Grace Period**: 72-hour transition window for existing users
- **Backward Compatibility**: Maintains support for legacy verification flows
- **Data Preservation**: Ensures no data loss during migration

### Key Schema Improvements
- **Channel-Based Verification**: Simplified verification flow (removed message_id dependency)
- **Enhanced Tracking**: Comprehensive role assignment history and status
- **Performance Optimized**: Indexed queries for high-performance operations
- **Extensible Design**: Future-proof schema supporting new verification types

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

### Core Documentation
- **[API Documentation](API_DOCUMENTATION.md)** - Complete API reference with examples
- **[Service Documentation](SERVICE_DOCUMENTATION.md)** - Detailed service architecture and integration guides
- **[Dynamic Role Management](DYNAMIC_ROLE_MANAGEMENT.md)** - Automated role management system
- **[Database Refactoring](DATABASE_REFACTORING_COMPLETE.md)** - Schema migration and optimization

### Architecture Documentation
- **[Security Audit Report](../docs/SECURITY_AUDIT.md)** - Comprehensive security analysis
- **[Migration Guide](supabase/migrations/README.md)** - Database migration procedures
- **[Performance Optimization](../OPTIMIZATION_SUMMARY.md)** - System performance improvements

### Development Guides
- **[Testing Strategy](#-testing)** - Test coverage and testing procedures
- **[Deployment Guide](#-deployment)** - Production deployment instructions
- **[Contributing Guidelines](#-contributing)** - Development best practices
