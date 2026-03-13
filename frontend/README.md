# Verethier Frontend

Angular web application for wallet connection and Discord role verification.

## 🏗️ Tech Stack

- **Angular 17** with TypeScript
- **SCSS** for styling
- **Web3** wallet integration
- **HTTP Client** for API communication

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Yarn

### Setup
```bash
yarn install
yarn start
```

Navigate to `http://localhost:4200/`

### Environment Configuration
Update `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000'
};
```

## 📁 Project Structure

```
frontend/
├── src/
│   ├── app/              # Components and services
│   ├── assets/           # Static files
│   ├── environments/     # Environment configs
│   └── scss/             # Global styles
└── dist/                 # Build output
```

## 🔧 Features

- **Wallet Connection** - MetaMask integration
- **Discord Integration** - Role verification UI
- **Responsive Design** - Mobile-friendly interface

## 📜 Scripts

```bash
yarn start            # Development server
yarn build            # Build for production
yarn test             # Run tests
yarn lint             # Code linting
```

## 🚀 Deployment

### Build for Production
```bash
yarn build
```

### Deploy
Deploy the `dist/` folder to:
- Netlify
- Vercel  
- GitHub Pages
- Any static hosting service

## 📚 Documentation

- [Angular Documentation](https://angular.io/docs)
- [Project Root README](../README.md)
