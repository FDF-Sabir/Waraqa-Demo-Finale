import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FactureEntity } from './facture.entity';
import { JournalService } from '../journal/journal.service';
import { DesignationsService } from '../designations/designations.service';
import { calculerHtEtTva, TauxInvalideError } from '../common/calculs';
import { detecterDoublon, LigneComparable } from '../common/calculs';
import {
  ChampsBrutsTableau5,
  SOUS_TYPES_VIGILANCE_RENFORCEE,
  SousType,
  StatutFacture,
  champsManquants,
  estLigneBancaireOrpheline,
  idPaieEstValide,
} from '../common/types';
import { CreerFactureDto } from './dto/creer-facture.dto';
import { ModifierFactureDto } from './dto/modifier-facture.dto';

export interface AuteurAction {
  utilisateurId?: number;
  saisiPar?: string;
}

@Injectable()
export class FacturesService {
  constructor(
    @InjectRepository(FactureEntity)
    private readonly repo: Repository<FactureEntity>,
    private readonly journal: JournalService,
    private readonly designations: DesignationsService,
  ) {}

  /**
   * Enveloppe `calculerHtEtTva` en convertissant `TauxInvalideError`
   * (erreur métier interne) en `BadRequestException` HTTP — sans ce
   * mapping, un taux non légal remontait en 500 Internal Server Error
   * au lieu d'un 400 exploitable par le client.
   */
  private calculerOuRejeter(mTtc: number, taux: number) {
    try {
      return calculerHtEtTva(mTtc, taux);
    } catch (erreur) {
      if (erreur instanceof TauxInvalideError) {
        throw new BadRequestException(erreur.message);
      }
      throw erreur;
    }
  }

  async lister(): Promise<FactureEntity[]> {
    return this.repo.find({ where: { archivee: false } });
  }

  /**
   * Filtre par mois (format "YYYY-MM"), dérivé de `dateFac` en priorité
   * puis `datePaie` — utilisé par le frontend waraqa-hub-main
   * (`GET /factures?mois=...`). Ajout additif : `lister()` reste
   * inchangée et continue d'être utilisée telle quelle par le reste du
   * pipeline déjà testé.
   */
  async listerParMois(mois: string): Promise<FactureEntity[]> {
    const toutes = await this.lister();
    return toutes.filter((f) => {
      const reference = f.datePaie || f.dateFac;
      return reference?.slice(0, 7) === mois;
    });
  }

  /**
   * Validation humaine explicite d'une ligne (revue de l'extraction IA
   * confirmée par le comptable) — n'altère aucun champ ni statut calculé,
   * journalise uniquement l'action pour la traçabilité. Distinct de
   * `confirmerSansFacture`, qui s'applique uniquement aux lignes
   * bancaires orphelines.
   */
  async validerLigne(id: number, auteur: AuteurAction): Promise<FactureEntity> {
    const facture = await this.trouver(id);

    if (facture.statut !== StatutFacture.VALIDEE || facture.doublonDe || facture.archivee) {
      throw new BadRequestException('Corrigez les champs manquants et le doublon avant validation.');
    }
    facture.revueHumaine = true;
    await this.repo.save(facture);
    await this.journal.ecrire({
      action: 'validation_humaine',
      factureId: id,
      utilisateurId: auteur.utilisateurId,
      saisiPar: auteur.saisiPar,
      details: { message: "Ligne extraite par l'IA revue et validée par le comptable." },
      notifiable: false,
    });

    return facture;
  }

  async trouver(id: number): Promise<FactureEntity> {
    const facture = await this.repo.findOne({ where: { id } });
    if (!facture) {
      throw new NotFoundException(`Facture ${id} introuvable.`);
    }
    return facture;
  }

  async creer(dto: CreerFactureDto, auteur: AuteurAction): Promise<FactureEntity> {
    if (dto.idPaie !== undefined && !idPaieEstValide(dto.idPaie)) {
      throw new BadRequestException(
        `idPaie invalide : ${dto.idPaie}. Valeurs DGI valides : 1 à 7.`,
      );
    }

    const { mHt, tva, mTtc } = this.calculerOuRejeter(dto.mTtc, dto.taux);

    const champsPourControle: ChampsBrutsTableau5 = {
      or: dto.or,
      factNum: dto.factNum,
      designation: dto.designation,
      mTtc,
      iff: dto.iff,
      libFrss: dto.libFrss,
      iceFrs: dto.iceFrs,
      taux: dto.taux,
      idPaie: dto.idPaie,
      datePaie: dto.datePaie,
      dateFac: dto.dateFac,
    };

    const manquants = champsManquants(dto.sousType, champsPourControle);
    const vigilance = SOUS_TYPES_VIGILANCE_RENFORCEE.includes(dto.sousType);
    const ligneOrpheline = estLigneBancaireOrpheline(champsPourControle);

    let statut: StatutFacture;
    if (ligneOrpheline) {
      statut = StatutFacture.EN_ATTENTE_CONFIRMATION_PAIEMENT;
    } else if (manquants.length > 0) {
      statut = StatutFacture.INCOMPLETE;
    } else {
      statut = StatutFacture.VALIDEE;
    }

    // Détection de doublon — comparaison contre toutes les factures existantes.
    const existantes: LigneComparable[] = (await this.lister()).map((f) => ({
      id: f.id,
      factNum: f.factNum,
      iceFrs: f.iceFrs,
      iff: f.iff,
      mTtc: f.mTtc,
    }));
    const doublon = detecterDoublon(
      { factNum: dto.factNum, iceFrs: dto.iceFrs, iff: dto.iff, mTtc },
      existantes,
    );

    const facture = await this.repo.save(
      this.repo.create({
        or: dto.or,
        factNum: dto.factNum,
        designation: dto.designation,
        mHt,
        tva,
        mTtc,
        iff: dto.iff,
        libFrss: dto.libFrss,
        iceFrs: dto.iceFrs,
        taux: dto.taux,
        idPaie: dto.idPaie,
        datePaie: dto.datePaie,
        dateFac: dto.dateFac,
        sousType: dto.sousType,
        statut,
        champsManquants: manquants.length > 0 ? manquants : undefined,
        vigilanceRenforcee: vigilance,
        utilisateurId: auteur.utilisateurId,
        saisiPar: auteur.saisiPar,
        lotId: dto.lotId,
        doublonDe: doublon?.id,
        notifiable: Boolean(doublon) || vigilance || ligneOrpheline,
      }),
    );

    // Désignation nouvelle éventuelle → workflow de confirmation IA.
    if (dto.designation) {
      await this.designations.ajouterDepuisIA(dto.designation);
    }

    await this.journal.ecrire({
      action: 'facture_creee',
      factureId: facture.id,
      utilisateurId: auteur.utilisateurId,
      saisiPar: auteur.saisiPar,
      lotId: dto.lotId,
      details: {
        sousType: dto.sousType,
        statut,
        champsManquants: manquants,
        doublonDetecte: doublon ? doublon.id : null,
        vigilanceRenforcee: vigilance,
      },
      notifiable: Boolean(doublon) || vigilance || ligneOrpheline,
    });

    if (doublon) {
      await this.journal.ecrire({
        action: 'doublon_detecte',
        factureId: facture.id,
        utilisateurId: auteur.utilisateurId,
        saisiPar: auteur.saisiPar,
        details: { factureOriginaleId: doublon.id },
        notifiable: true,
      });
    }

    return facture;
  }

  /**
   * Met à jour une ligne. Si la facture était en statut
   * `en_attente_confirmation_paiement` et que la mise à jour apporte les
   * champs source manquants (issue 1 : facture source retrouvée), le
   * statut est recalculé normalement.
   */
  async modifier(
    id: number,
    dto: ModifierFactureDto,
    auteur: AuteurAction,
  ): Promise<FactureEntity> {
    const facture = await this.trouver(id);

    if (dto.idPaie !== undefined && !idPaieEstValide(dto.idPaie)) {
      throw new BadRequestException(
        `idPaie invalide : ${dto.idPaie}. Valeurs DGI valides : 1 à 7.`,
      );
    }

    const mTtcEffectif = dto.mTtc ?? facture.mTtc;
    const tauxEffectif = dto.taux ?? facture.taux;

    if (mTtcEffectif === undefined || tauxEffectif === undefined) {
      throw new BadRequestException('mTtc et taux sont requis pour recalculer la ligne.');
    }

    const { mHt, tva, mTtc } = this.calculerOuRejeter(mTtcEffectif, tauxEffectif);

    const sousTypeEffectif = dto.sousType ?? facture.sousType;
    const champsPourControle: ChampsBrutsTableau5 = {
      or: dto.or ?? facture.or,
      factNum: dto.factNum ?? facture.factNum,
      designation: dto.designation ?? facture.designation,
      mTtc,
      iff: dto.iff ?? facture.iff,
      libFrss: dto.libFrss ?? facture.libFrss,
      iceFrs: dto.iceFrs ?? facture.iceFrs,
      taux: tauxEffectif,
      idPaie: dto.idPaie ?? facture.idPaie,
      datePaie: dto.datePaie ?? facture.datePaie,
      dateFac: dto.dateFac ?? facture.dateFac,
    };

    const manquants = champsManquants(sousTypeEffectif, champsPourControle);
    const vigilance = SOUS_TYPES_VIGILANCE_RENFORCEE.includes(sousTypeEffectif);
    const ligneOrpheline = estLigneBancaireOrpheline(champsPourControle);

    let statut: StatutFacture;
    if (ligneOrpheline) {
      statut = StatutFacture.EN_ATTENTE_CONFIRMATION_PAIEMENT;
    } else if (manquants.length > 0) {
      statut = StatutFacture.INCOMPLETE;
    } else {
      statut = StatutFacture.VALIDEE;
    }

    Object.assign(facture, {
      or: champsPourControle.or,
      factNum: champsPourControle.factNum,
      designation: champsPourControle.designation,
      mHt,
      tva,
      mTtc,
      iff: champsPourControle.iff,
      libFrss: champsPourControle.libFrss,
      iceFrs: champsPourControle.iceFrs,
      taux: tauxEffectif,
      idPaie: champsPourControle.idPaie,
      datePaie: champsPourControle.datePaie,
      dateFac: champsPourControle.dateFac,
      sousType: sousTypeEffectif,
      statut,
      champsManquants: manquants,
      revueHumaine: false,
      vigilanceRenforcee: vigilance,
    });

    const autres = (await this.lister()).filter(f => f.id !== id);
    facture.doublonDe = detecterDoublon(facture, autres)?.id ?? null as any;
    const sauvegardee = await this.repo.save(facture);

    await this.journal.ecrire({
      action: 'facture_modifiee',
      factureId: id,
      utilisateurId: auteur.utilisateurId,
      saisiPar: auteur.saisiPar,
      details: { statut, champsManquants: manquants },
      notifiable: vigilance,
    });

    return sauvegardee;
  }

  /**
   * Issue 2 du statut `en_attente_confirmation_paiement` : le comptable
   * confirme explicitement que la ligne reste telle quelle, sans facture
   * source. Action distincte de `modifier`, journalisée spécifiquement
   * pour rester traçable lors d'un contrôle fiscal a posteriori.
   */
  async confirmerSansFacture(id: number, auteur: AuteurAction): Promise<FactureEntity> {
    const facture = await this.trouver(id);

    if (facture.statut !== StatutFacture.EN_ATTENTE_CONFIRMATION_PAIEMENT) {
      throw new BadRequestException(
        `La facture ${id} n'est pas en attente de confirmation de paiement (statut actuel : ${facture.statut}).`,
      );
    }

    facture.statut = StatutFacture.VALIDEE;
    const autres = (await this.lister()).filter(f => f.id !== id);
    facture.doublonDe = detecterDoublon(facture, autres)?.id ?? null as any;
    const sauvegardee = await this.repo.save(facture);

    await this.journal.ecrire({
      action: 'confirmation_sans_facture_source',
      factureId: id,
      utilisateurId: auteur.utilisateurId,
      saisiPar: auteur.saisiPar,
      details: {
        message:
          'Ligne confirmée explicitement par le comptable sans facture source rapprochée — choix humain assumé, pas un oubli du système.',
      },
      notifiable: false,
    });

    return sauvegardee;
  }
}
