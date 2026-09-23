import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * État de lecture/traitement d'une notification, PAR utilisateur — jamais
 * un champ directement sur `JournalEntity` : le journal est un
 * enregistrement immuable destiné au contrôle fiscal (voir
 * journal.entity.ts), il ne doit pas porter d'état mutable "lu"/"traité"
 * qui varie selon qui l'a consulté. Une notification est une entrée du
 * journal avec `notifiable: true` (#14, services-a-developper.md) — cette
 * table ne fait qu'associer un état de lecture à ce couple
 * (utilisateur, entrée de journal), de façon additive.
 */
@Entity('notification_etat')
@Index(['journalId', 'utilisateurId'], { unique: true })
export class NotificationEtatEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  journalId!: number;

  @Column()
  utilisateurId!: number;

  @Column({ default: false })
  lue!: boolean;

  @Column({ default: false })
  traitee!: boolean;

  @Column({ nullable: true })
  lueLe?: string;

  @Column({ nullable: true })
  traiteeLe?: string;
}
