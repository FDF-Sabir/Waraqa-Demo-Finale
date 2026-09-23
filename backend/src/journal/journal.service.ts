import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntity } from './journal.entity';

export interface EcrireJournalParams {
  action: string;
  factureId?: number;
  designationId?: number;
  utilisateurId?: number;
  saisiPar?: string;
  lotId?: string;
  details?: Record<string, unknown> | string;
  notifiable?: boolean;
}

/**
 * Source d'événements unique partagée avec le futur service de
 * notification (#14) — le flag `notifiable` est déjà prêt à être
 * consommé (services-a-developper.md, déduction #3).
 */
@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntity)
    private readonly repo: Repository<JournalEntity>,
  ) {}

  async ecrire(params: EcrireJournalParams): Promise<JournalEntity> {
    const entree = this.repo.create({
      action: params.action,
      factureId: params.factureId,
      designationId: params.designationId,
      utilisateurId: params.utilisateurId,
      saisiPar: params.saisiPar,
      lotId: params.lotId,
      details:
        typeof params.details === 'string'
          ? params.details
          : params.details
            ? JSON.stringify(params.details)
            : undefined,
      notifiable: Boolean(params.notifiable) || false,
      horodatage: new Date().toISOString(),
    });
    return this.repo.save(entree);
  }

  async listerParFacture(factureId: number): Promise<JournalEntity[]> {
    const entrees = await this.repo.find({ where: { factureId } });
    return entrees.sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  }

  async listerTout(): Promise<JournalEntity[]> {
    const entrees = await this.repo.find();
    return entrees.sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  }

  async listerNotifiables(): Promise<JournalEntity[]> {
    const entrees = await this.repo.find({ where: { notifiable: true } });
    return entrees.sort((a, b) => a.horodatage.localeCompare(b.horodatage));
  }

  /** Utilisé par NotificationsService — lève si l'entrée n'existe pas ou n'est pas notifiable. */
  async obtenirNotifiable(id: number): Promise<JournalEntity> {
    const entree = await this.repo.findOne({ where: { id, notifiable: true } });
    if (!entree) throw new NotFoundException('Notification introuvable.');
    return entree;
  }
}
