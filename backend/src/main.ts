import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv, corsOrigins } from './config/env.validation';

async function bootstrap() {
  validateEnv(); // refuse de démarrer en prod si un secret critique manque

  // rawBody: true -> req.rawBody disponible pour vérifier la signature Wave.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());                       // en-têtes de sécurité
  app.enableCors({ origin: corsOrigins() }); // origines restreintes en prod
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  await app.listen(process.env.PORT ?? 3000);
  // eslint-disable-next-line no-console
  console.log(`Newdem API sur le port ${process.env.PORT ?? 3000}`);
}
bootstrap();
