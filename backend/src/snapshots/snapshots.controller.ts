import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FacturesService } from '../factures/factures.service';
import { StatutFacture } from '../common/types';

export interface SyntheseMensuelleCompat {
  mois: string;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  lignes_total: number;
  par_statut: Record<string, number>;
  en_erreur: number;
  dernier_snapshot: string | null;
}

function arrondir2(valeur: number): number {
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

/**
 * Agrégation en lecture seule pour le tableau de bord du frontend
 * waraqa-hub-main (`GET /snapshots/synthese?mois=YYYY-MM`). Calculée à
 * la volée depuis les factures existantes — aucun stockage de snapshot
 * pour l'instant (le snapshot mensuel persisté et configurable reste la
 * tâche #16 du backlog, non couverte ici).
 *
 * `en_erreur` est toujours 0 et `dernier_snapshot` toujours null tant
 * que le traitement par lot (#15) et le snapshot mensuel (#16) ne sont
 * pas implémentés — valeurs honnêtes plutôt qu'inventées.
 */
@Controller('snapshots')
@UseGuards(JwtAuthGuard)
export class SnapshotsController {
  constructor(private readonly facturesService: FacturesService) {}

  @Get('synthese')
  async synthese(@Query('mois') mois: string): Promise<SyntheseMensuelleCompat> {
    const lignes = mois
      ? await this.facturesService.listerParMois(mois)
      : await this.facturesService.lister();

    const parStatut: Record<string, number> = {};
    for (const statut of Object.values(StatutFacture)) {
      parStatut[statut] = 0;
    }
    let totalHt = 0;
    let totalTva = 0;
    let totalTtc = 0;

    for (const ligne of lignes) {
      parStatut[ligne.statut] = (parStatut[ligne.statut] ?? 0) + 1;
      totalHt += ligne.mHt ?? 0;
      totalTva += ligne.tva ?? 0;
      totalTtc += ligne.mTtc ?? 0;
    }

    return {
      mois: mois ?? '',
      total_ht: arrondir2(totalHt),
      total_tva: arrondir2(totalTva),
      total_ttc: arrondir2(totalTtc),
      lignes_total: lignes.length,
      par_statut: parStatut,
      en_erreur: 0,
      dernier_snapshot: null,
    };
  }
}
