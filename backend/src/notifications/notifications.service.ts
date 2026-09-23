import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JournalService } from '../journal/journal.service';
import { JournalEntity } from '../journal/journal.entity';
import { NotificationEtatEntity } from './notification-etat.entity';

export interface NotificationVue {
  id: number; // = journalId
  action: string;
  factureId?: number;
  designationId?: number;
  details?: string;
  horodatage: string;
  lue: boolean;
  traitee: boolean;
}

/**
 * Couche de lecture/état au-dessus du journal — n'écrit jamais dans le
 * journal lui-même (immuable). Émettre une notification reste la
 * responsabilité de chaque service métier via `JournalService.ecrire({
 * notifiable: true, ... })` (déjà en place pour doublons, vigilance
 * renforcée, lignes orphelines, désignations IA) : ce service ne fait que
 * lire `listerNotifiables()` et suivre l'état lu/traité par utilisateur.
 *
 * Transport (push web / email) volontairement hors périmètre ici : nécessite
 * des identifiants externes (clés VAPID, compte SMTP) qu'on ne peut pas
 * fabriquer côté serveur — voir note dans reglages (notif_push_web/
 * notif_email) qui restent pour l'instant des préférences non branchées à
 * un envoi réel.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly journalService: JournalService,
    @InjectRepository(NotificationEtatEntity)
    private readonly etatRepo: Repository<NotificationEtatEntity>,
  ) {}

  async lister(utilisateurId: number): Promise<NotificationVue[]> {
    const notifiables = await this.journalService.listerNotifiables();
    if (notifiables.length === 0) return [];

    const etats = await this.etatRepo.find({
      where: { utilisateurId, journalId: In(notifiables.map((n) => n.id)) },
    });
    const etatParJournal = new Map(etats.map((e) => [e.journalId, e]));

    return notifiables
      .map((n) => this.versVue(n, etatParJournal.get(n.id)))
      .sort((a, b) => b.horodatage.localeCompare(a.horodatage)); // plus récent d'abord
  }

  async listerNonLues(utilisateurId: number): Promise<NotificationVue[]> {
    const toutes = await this.lister(utilisateurId);
    return toutes.filter((n) => !n.lue);
  }

  async marquerLue(journalId: number, utilisateurId: number): Promise<NotificationVue> {
    const entree = await this.journalService.obtenirNotifiable(journalId);
    const etat = await this.obtenirOuCreerEtat(journalId, utilisateurId);
    etat.lue = true;
    etat.lueLe = new Date().toISOString();
    await this.etatRepo.save(etat);
    return this.versVue(entree, etat);
  }

  async marquerTraitee(journalId: number, utilisateurId: number): Promise<NotificationVue> {
    const entree = await this.journalService.obtenirNotifiable(journalId);
    const etat = await this.obtenirOuCreerEtat(journalId, utilisateurId);
    etat.lue = true;
    etat.lueLe = etat.lueLe ?? new Date().toISOString();
    etat.traitee = true;
    etat.traiteeLe = new Date().toISOString();
    await this.etatRepo.save(etat);
    return this.versVue(entree, etat);
  }

  private async obtenirOuCreerEtat(
    journalId: number,
    utilisateurId: number,
  ): Promise<NotificationEtatEntity> {
    const existant = await this.etatRepo.findOne({ where: { journalId, utilisateurId } });
    if (existant) return existant;
    return this.etatRepo.create({ journalId, utilisateurId });
  }

  private versVue(entree: JournalEntity, etat?: NotificationEtatEntity): NotificationVue {
    return {
      id: entree.id,
      action: entree.action,
      factureId: entree.factureId,
      designationId: entree.designationId,
      details: entree.details,
      horodatage: entree.horodatage,
      lue: etat?.lue ?? false,
      traitee: etat?.traitee ?? false,
    };
  }
}

