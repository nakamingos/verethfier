# Verethfier Frontend

Angular web application for wallet connection and Ethscriptions-based Discord role verification.

## 🏗️ Architecture

- **Framework**: Angular 17 with TypeScript
- **Styling**: SCSS with modern design
- **Wallet Integration**: Web3 wallet connection support
- **API Communication**: HTTP client for backend integration
- **State Management**: Angular services and RxJS

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Yarn package manager
- Angular CLI (optional, for ng commands)

### Installation
```bash
yarn install
```

### Development Server
```bash
yarn start
# or
ng serve
```

Navigate to `http://localhost:4200/`. The application will automatically reload when you change source files.

### Environment Configuration
Update `src/environments/environment.ts` with your backend URL:
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
│   ├── app/              # Application modules and components
│   ├── assets/           # Static assets (images, fonts)
│   ├── environments/     # Environment configurations
│   └── scss/            # Global styles
├── dist/                # Build output
└── angular.json         # Angular workspace configuration
```

## 🔧 Key Features

### Wallet Connection
- MetaMask integration
- WalletConnect support
- Signature verification
- Address validation

### Discord Integration
- Role verification UI
- Real-time status updates
- Error handling and feedback
- Responsive design

### User Experience
- Modern, clean interface
- Mobile-responsive design
- Loading states and feedback
- Error handling with user-friendly messages

## 📜 Available Scripts

- `yarn start` - Start development server
- `yarn build` - Build for production
- `yarn build:prod` - Production build with optimization
- `yarn test` - Run unit tests with Karma
- `yarn lint` - ESLint checking
- `yarn e2e` - End-to-end tests (when configured)

## 🧪 Testing

### Unit Tests
```bash
yarn test
```
Execute unit tests via [Karma](https://karma-runner.github.io).

### End-to-End Tests
```bash
yarn e2e
```
Run end-to-end tests via your preferred testing platform.

### Code Generation
```bash
ng generate component component-name
ng generate service service-name
ng generate directive|pipe|guard|interface|enum|module
```

## 🚀 Building & Deployment

### Development Build
```bash
yarn build
```

### Production Build
```bash
yarn build:prod
```

Build artifacts are stored in the `dist/` directory.

### Deployment Options
- **Static Hosting**: Deploy `dist/` folder to Netlify, Vercel, or GitHub Pages
- **Docker**: Create container with nginx to serve static files
- **CDN**: Upload to AWS S3 + CloudFront or similar

### Example Docker Deployment
```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
EXPOSE 80
```

## ⚙️ Configuration

### Environment Variables
Configure in `src/environments/`:

#### Development (`environment.ts`)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
  appName: 'Verethfier'
};
```

#### Production (`environment.prod.ts`)
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-api-domain.com',
  appName: 'Verethfier'
};
```

## 🎨 Styling

### SCSS Structure
- Global styles in `src/scss/`
- Component-specific styles in component folders
- Variables and mixins for consistent theming
- Responsive design with mobile-first approach

### Theme Customization
Update SCSS variables in `src/scss/variables.scss` for:
- Color schemes
- Typography
- Spacing
- Breakpoints

## 🤝 Contributing

1. Follow Angular style guide and best practices
2. Use TypeScript strict mode
3. Write unit tests for new components
4. Follow consistent naming conventions
5. Use reactive patterns with RxJS

## 📚 Additional Resources

- [Angular Documentation](https://angular.io/docs)
- [Angular CLI Reference](https://angular.io/cli)
- [RxJS Documentation](https://rxjs.dev/)
- [Angular Material](https://material.angular.io/) (if used)
