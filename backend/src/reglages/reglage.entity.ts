import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Réglages utilisateur — une ligne par utilisateur (`utilisateurId` unique),
 * créée à la volée avec des valeurs par défaut au premier GET (voir
 * `ReglagesService.obtenirOuCreer`). Pas de réglages globaux pour l'instant :
 * chaque comptable a ses propres préférences de notification/snapshot,
 * cohérent avec `notif_push_web`/`notif_email` déjà scoping par utilisateur
 * côté frontend (`services/api/index.ts` → `reglagesApi`).
 */
@Entity('reglages')
export class ReglageEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  utilisateurId!: number;

  @Column({ default: 'fin_de_mois' })
  frequenceSnapshot!: 'hebdomadaire' | 'bi_mensuel' | 'fin_de_mois';

  @Column({ default: true })
  notifPushWeb!: boolean;

  @Column({ default: true })
  notifEmail!: boolean;
}
