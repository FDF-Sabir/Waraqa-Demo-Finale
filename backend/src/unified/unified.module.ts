import { ReglageEntity } from "../reglages/reglage.entity";
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkspaceRecord } from "./record.entity";
import { UnifiedController } from "./unified.controller";
import { UnifiedService } from "./unified.service";
import { FacturesModule } from "../factures/factures.module";
import { JournalModule } from "../journal/journal.module";
import { OcrModule } from "../ocr/ocr.module";
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
  ],
  controllers: [UnifiedController],
  providers: [UnifiedService],
})
export class UnifiedModule {}
