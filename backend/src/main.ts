import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST'],
  });
  await app.listen(3200);
  
  Logger.debug(`Server running on http://localhost:3200`, 'Bootstrap');
}
bootstrap();
