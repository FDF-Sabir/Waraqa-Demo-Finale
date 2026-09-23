import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesignationEntity } from './designation.entity';
import { JournalService } from '../journal/journal.service';

/** Seed initial — 5 valeurs RÉELLEMENT observées (voir common/types.ts et decouvertes-fichier-reel-tva.md). */
export const DESIGNATIONS_SEED = [
  'COMMISSION',
  'SERVICE',
  'GASOIL',
  'ACHAT',
  'RECEVEUR DOUANE',
];

@Injectable()
export class DesignationsService {
  constructor(
    @InjectRepository(DesignationEntity)
    private readonly repo: Repository<DesignationEntity>,
    private readonly journal: JournalService,
  ) {}

  async initialiserSeed(): Promise<void> {
    for (const libelle of DESIGNATIONS_SEED) {
      const existante = await this.repo.findOne({ where: { libelle } });
      if (!existante) {
        await this.repo.save(
          this.repo.create({ libelle, enAttenteConfirmation: false }),
        );
      }
    }
  }

  async lister(): Promise<DesignationEntity[]> {
    return this.repo.find();
  }

  async listerEnAttente(): Promise<DesignationEntity[]> {
    return this.repo.find({ where: { enAttenteConfirmation: true } });
  }

  /**
   * Ajoute une désignation jamais vue, en attente de confirmation —
   * appelé par le pipeline d'extraction IA. Idempotent : si la
   * désignation existe déjà (confirmée ou en attente), ne duplique jamais
   * et n'est jamais reproposée une fois confirmée (décision #6,
   * decisions-finales-avant-cdc.md).
   */
  async ajouterDepuisIA(libelle: string): Promise<DesignationEntity> {
    const libelleNormalise = libelle.trim().toUpperCase();
    const existante = await this.repo.findOne({ where: { libelle: libelleNormalise } });
    if (existante) {
      return existante;
    }

    const nouvelle = await this.repo.save(
      this.repo.create({ libelle: libelleNormalise, enAttenteConfirmation: true }),
    );

    await this.journal.ecrire({
      action: 'designation_suggeree_ia',
      designationId: nouvelle.id,
      details: { libelle: libelleNormalise },
      notifiable: true,
    });

    return nouvelle;
  }

  async confirmer(id: number, utilisateurId?: number, saisiPar?: string): Promise<DesignationEntity> {
    const designation = await this.repo.findOne({ where: { id } });
    if (!designation) {
      throw new NotFoundException(`Désignation ${id} introuvable.`);
    }

    designation.enAttenteConfirmation = false;
    const sauvegardee = await this.repo.save(designation);

    await this.journal.ecrire({
      action: 'designation_confirmee',
      designationId: id,
      utilisateurId,
      saisiPar,
      details: { libelle: designation.libelle },
    });

    return sauvegardee;
  }
}
