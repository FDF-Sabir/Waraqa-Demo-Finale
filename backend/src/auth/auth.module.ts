import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

const SECRET_DEV_UNIQUEMENT = 'waraqa-dev-secret-ne-jamais-utiliser-en-production';

@Module({
  imports: [
    TypeOrmModule.forFeature([UtilisateurEntity]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('WARAQA_JWT_SECRET');
        const estProduction = config.get<string>('NODE_ENV') === 'production';
        if (!secret && estProduction) {
          throw new Error(
            'WARAQA_JWT_SECRET est obligatoire en production. ' +
              'Définissez cette variable d\'environnement avant de démarrer.',
          );
        }
        return {
          secret: secret || SECRET_DEV_UNIQUEMENT,
          signOptions: {
            expiresIn: config.get<string>('WARAQA_JWT_EXPIRATION') || '30d',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: JwtStrategy,
      inject: [ConfigService, getRepositoryToken(UtilisateurEntity)],
      useFactory: (config: ConfigService, users: Repository<UtilisateurEntity>) =>
        new JwtStrategy(config.get<string>('WARAQA_JWT_SECRET') || SECRET_DEV_UNIQUEMENT, users),
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
