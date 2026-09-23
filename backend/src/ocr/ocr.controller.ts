import { liveOcrWanted } from '../common/profile';
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant } from '../auth/utilisateur.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { OcrService } from './ocr.service';
import { FacturesService } from '../factures/factures.service';
import { FactureEntity } from '../factures/facture.entity';
import { IdPaie } from '../common/types';

export interface ReponseTraitementFichier {
  sousType: string;
  confiance: number;
  facturesCreees: FactureEntity[];
}

/**
 * Point d'entrée unique de dépôt de fichier — accepte JPG/PNG/PDF/XLSX/CSV
 * (voir `decouvertes-fichier-reel-tva.md` §7). Un seul appel au service
 * d'extraction IA (`OcrService`), puis chaque ligne extraite est créée via
 * le pipeline `FacturesService` existant SANS AUCUNE modification de
 * celui-ci : calcul HT/TVA serveur-only, contrôle fiscal par sous-type,
 * détection de doublon, statut dédié pour ligne bancaire orpheline —
 * tout reste strictement le pipeline déjà testé (44 tests avant cette
 * tâche, désormais 60).
 */
@Controller('ocr')
@UseGuards(JwtAuthGuard)
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly facturesService: FacturesService,
  ) {}

  @Post('traiter')
  @UseInterceptors(FileInterceptor('fichier', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async traiter(
    @UploadedFile() fichier: Express.Multer.File,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<ReponseTraitementFichier> {
    if (!fichier) {
      throw new BadRequestException('Aucun fichier reçu (champ attendu : "fichier").');
    }

    if (process.env.NODE_ENV !== 'test' && (!liveOcrWanted() || !process.env.ANTHROPIC_API_KEY)) throw new BadRequestException('Sans clé, utilisez Importer : stockage et saisie manuelle, sans extraction inventée.');
    const resultat = await this.ocrService.extraire(fichier.buffer, fichier.originalname);

    const facturesCreees: FactureEntity[] = [];
    for (const ligne of resultat.lignes) {
      // mTtc et taux sont indispensables pour le calcul serveur-only ;
      // une ligne extraite sans l'un des deux est ignorée ici plutôt que
      // de planter tout le lot — cohérent avec le principe "isoler
      // l'erreur, continuer les autres" (services-a-developper.md).
      if (ligne.mTtc === undefined || ligne.taux === undefined) {
        continue;
      }

      const facture = await this.facturesService.creer(
        {
          or: ligne.or,
          factNum: ligne.factNum,
          designation: ligne.designation,
          mTtc: ligne.mTtc,
          iff: ligne.iff,
          libFrss: ligne.libFrss,
          iceFrs: ligne.iceFrs,
          taux: ligne.taux,
          idPaie: ligne.idPaie as IdPaie | undefined,
          datePaie: ligne.datePaie,
          dateFac: ligne.dateFac,
          sousType: resultat.sousType,
        },
        { utilisateurId: utilisateur.sub, saisiPar: utilisateur.nom },
      );
      facturesCreees.push(facture);
    }

    return {
      sousType: resultat.sousType,
      confiance: resultat.confiance,
      facturesCreees,
    };
  }
}
