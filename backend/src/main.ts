import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { EnvironmentConfig } from './config/environment.config';

// Validate environment variables at startup
EnvironmentConfig.validate();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: EnvironmentConfig.IS_TEST 
      ? false 
      : EnvironmentConfig.NODE_ENV === 'development' 
        ? ['error', 'warn', 'log', 'debug', 'verbose']
        : ['error', 'warn', 'log'],
  });

  // Security: Add security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  }));

  // Security: Global validation pipe for input validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: false, // Don't strip unknown properties for flexibility
    forbidNonWhitelisted: false, // Allow unknown properties
    transform: true,
    disableErrorMessages: process.env.NODE_ENV === 'production',
    skipMissingProperties: true, // Allow optional properties
  }));

  app.setGlobalPrefix('api');
  
  // Security: Restrict CORS to known origins
  const allowedOrigins = [
    process.env.BASE_URL || 'http://localhost:4200',
    'http://localhost:4200', // Always allow local frontend for development
    'http://localhost:3000', // Common alternative port
    // Add production domain here when deployed
  ].filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        Logger.warn(`CORS blocked origin: ${origin}`, 'Security');
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(3200);
  
  Logger.debug(`Server running on http://localhost:3200`, 'Bootstrap');
}
bootstrap();
