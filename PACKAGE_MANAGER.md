# Package Manager Standardization

This project has been standardized to use **Yarn** as the single package manager.

## Status
- ✅ Backend: Uses Yarn (yarn.lock present, package-lock.json removed)
- ✅ Frontend: Uses Yarn (yarn.lock present, package-lock.json removed)

## Commands

### Backend
```bash
cd backend
yarn install          # Install dependencies
yarn start:dev         # Start development server
yarn test              # Run tests
yarn test:coverage     # Run tests with coverage
yarn build             # Build for production
```

### Frontend
```bash
cd frontend
yarn install          # Install dependencies
yarn start             # Start development server
yarn build             # Build for production
yarn test              # Run tests
```

## Notes
- Both `package.json` files specify `"packageManager": "yarn@1.22.22+sha512..."`
- All `package-lock.json` files have been removed (except those in node_modules)
- Project is fully functional with Yarn - all tests pass and builds work correctly
