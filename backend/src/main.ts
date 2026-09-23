import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DesignationsService } from './designations/designations.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix('api');

  // Seed du référentiel désignations réel au démarrage (idempotent).
  const designationsService = app.get(DesignationsService);
  await designationsService.initialiserSeed();

  const port = process.env.WARAQA_PORT || 3000;
  await app.listen(port, process.env.WARAQA_HOST || '127.0.0.1');
  // eslint-disable-next-line no-console
  console.log(`Waraqa backend démarré sur http://localhost:${port}`);
}

bootstrap();
