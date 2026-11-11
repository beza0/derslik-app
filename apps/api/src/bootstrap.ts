import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import type { AppConfig } from './config';

/** Uygulamayı oluşturur; hem `main.ts` hem entegrasyon testleri kullanır. */
export async function createApp(config: AppConfig, pool: Pool): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, pool), {
    logger: config.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  return app;
}
