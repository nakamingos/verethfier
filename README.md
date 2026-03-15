# Verethier

Discord-based wallet verification for Ethscriptions communities.

Verethier is split into two deployable apps:
- `backend/`: a NestJS API and Discord bot
- `frontend/`: an Angular verification app used by Discord users when they follow a verify link

## Features

- Wallet verification with EIP-712 signatures
- Collection-level, category-level, and trait-level verification rules
- Wallet stacking across multiple verified addresses
- Dynamic role re-verification and revocation
- Rich Discord verification result messages

## Requirements

- Node.js `20.19+` or `22.12+`
- Yarn `1.22.x`
- Supabase CLI for local database work
- A Discord application/bot and Supabase project(s)

## Project Layout

```text
verethier/
├── backend/    # NestJS API, Discord bot, Supabase migrations, tests
├── frontend/   # Angular verification app
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd backend
yarn install
cp env.example .env
```

Fill in `backend/.env` using [backend/env.example](backend/env.example).

If you want the checked-in frontend dev config to work without changes, run the backend on port `3200`:

```bash
PORT=3200 yarn start:dev
```

If `PORT` is unset, the backend defaults to `3000`.

### 2. Frontend

```bash
cd frontend
yarn install
yarn ng serve
```

The Angular dev server runs on `http://localhost:4200`.

The checked-in dev environment file, [env.dev.ts](frontend/src/env/env.dev.ts), currently points to `http://localhost:3200/api`.

### 3. Local Supabase

Migrations live in [backend/supabase/migrations](backend/supabase/migrations).

For a fresh local database:

```bash
cd backend
npx supabase start
npx supabase db reset
```

## Environment Overview

- Backend runtime config is documented in [backend/env.example](backend/env.example) and [backend/.env.production.example](backend/.env.production.example).
- Frontend API/RPC settings live in [env.ts](frontend/src/env/env.ts) and [env.dev.ts](frontend/src/env/env.dev.ts).

## Testing

```bash
cd backend
yarn test

cd ../frontend
yarn test --watch=false --browsers=ChromeHeadless
```

## Deployment Notes

- Backend and frontend deploy separately.
- The frontend is built output plus static serving: `yarn build` then `yarn start`.
- On Railway, prefer `Railpack` for both services.
- The frontend `start` script serves `dist/frontend/browser` and expects a build to exist first.

## Docs

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)

## License

[CC0 1.0 Universal](LICENSE)
