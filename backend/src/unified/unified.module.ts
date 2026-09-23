import { IntegrationsService } from "./integrations.service";
import { ReglageEntity } from "../reglages/reglage.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkspaceRecord } from "./record.entity";
import { UnifiedController } from "./unified.controller";
import { UnifiedService } from "./unified.service";
import { FacturesModule } from "../factures/factures.module";
import { JournalModule } from "../journal/journal.module";
import { OcrModule } from "../ocr/ocr.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { DesignationsModule } from "../designations/designations.module";
import { FactureEntity } from "../factures/facture.entity";
import { UtilisateurEntity } from "../utilisateurs/utilisateur.entity";
import { DesignationEntity } from "../designations/designation.entity";
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkspaceRecord,
      FactureEntity,
      UtilisateurEntity,
      DesignationEntity,
      ReglageEntity,
    ]),
    FacturesModule,
    JournalModule,
    OcrModule,
    NotificationsModule,
    DesignationsModule,
  ],
  controllers: [UnifiedController],
  providers: [UnifiedService, IntegrationsService],
})
export class UnifiedModule {}
