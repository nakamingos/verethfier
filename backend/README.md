# Verethier Backend

NestJS API and Discord bot for wallet verification, rule evaluation, and role assignment.

## Stack

- NestJS 9
- Supabase / Postgres
- Discord.js 14
- Jest

## What It Does

- Registers and manages Discord verification rules
- Verifies wallet ownership with EIP-712 signatures
- Evaluates collection-level, category-level, and trait-level rules
- Tracks assigned roles in `verifier_user_roles`
- Supports scheduled dynamic re-verification via `DYNAMIC_ROLE_CRON`

## Requirements

- Node.js `20.19+` or `22.12+` recommended for the repo as a whole
- Yarn `1.22.x`
- Supabase CLI for local database work

## Setup

```bash
yarn install
cp env.example .env
```

Then fill in `backend/.env`.

For local development that matches the checked-in frontend dev config:

```bash
PORT=3200 yarn start:dev
```

If `PORT` is unset, the app listens on `3000`.

## Environment Variables

See [env.example](env.example) for the full list. The main ones are:

```bash
BASE_URL=http://localhost:4200

DISCORD=1
DISCORD_CLIENT_ID=...
DISCORD_BOT_TOKEN=...

DATA_SUPABASE_URL=...
DATA_SUPABASE_ANON_KEY=...

DB_SUPABASE_URL=...
DB_SUPABASE_KEY=...

NONCE_EXPIRY=300000
DYNAMIC_ROLE_CRON=EVERY_6_HOURS
```

Notes:
- `BASE_URL` is used for CORS and verification flow URLs.
- `DATA_*` and `DB_*` can point at separate Supabase projects.
- `DYNAMIC_ROLE_CRON` accepts either the named presets in [environment.config.ts](src/config/environment.config.ts) or a raw cron expression.

## Database

Supabase migrations live in [supabase/migrations](supabase/migrations).

Typical local workflow:

```bash
npx supabase start
npx supabase db reset
```

## Scripts

```bash
yarn build          # Compile NestJS to dist/
yarn start          # Start once
yarn start:dev      # Start in watch mode
yarn start:debug    # Start with Nest debug mode
yarn start:prod     # Run dist/main

yarn test           # Full backend test suite
yarn test:watch     # Jest watch mode
yarn test:coverage  # Coverage report
yarn test:verbose   # Verbose Jest output
yarn test:debug     # Verbose, no-cache Jest run
```

## Project Layout

```text
backend/
├── src/
│   ├── config/
│   ├── constants/
│   ├── dtos/
│   ├── models/
│   └── services/
├── supabase/
│   └── migrations/
└── test/
```

## Related Docs

- [Project root README](../README.md)
- [Frontend README](../frontend/README.md)
