import { UnifiedModule } from './unified/unified.module';
import { WorkspaceRecord } from './unified/record.entity';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { FacturesModule } from './factures/factures.module';
import { DesignationsModule } from './designations/designations.module';
import { JournalModule } from './journal/journal.module';
import { OcrModule } from './ocr/ocr.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { ReglagesModule } from './reglages/reglages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UtilisateurEntity } from './utilisateurs/utilisateur.entity';
import { FactureEntity } from './factures/facture.entity';
import { DesignationEntity } from './designations/designation.entity';
import { JournalEntity } from './journal/journal.entity';
import { ReglageEntity } from './reglages/reglage.entity';
import { NotificationEtatEntity } from './notifications/notification-etat.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      // App web locale minimale (démo du 25/09) : UI statique servie
      // directement par le backend — le comptable ouvre son navigateur
      // sur localhost, aucun serveur front séparé.
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/(.*)'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite' as const,
        database: config.get<string>('WARAQA_DB_PATH') || 'waraqa.sqlite',
        entities: [
          WorkspaceRecord,
          UtilisateurEntity,
          FactureEntity,
          DesignationEntity,
          JournalEntity,
          ReglageEntity,
          NotificationEtatEntity,
        ],
        synchronize: true, // schéma géré par synchronize pour cette phase — pas de migrations séparées encore
      }),
    }),
    UnifiedModule,
    AuthModule,
    FacturesModule,
    DesignationsModule,
    JournalModule,
    OcrModule,
    SnapshotsModule,
    ReglagesModule,
    NotificationsModule,
  ],
})
export class AppModule {}
