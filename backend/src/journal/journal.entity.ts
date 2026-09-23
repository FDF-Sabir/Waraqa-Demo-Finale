import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Journal des actions, ligne par ligne — traçage 100% transparent
 * (objectif #5, services-a-developper.md). Partage la même source
 * d'événements que le service de notification (pas deux systèmes séparés) :
 * tout ce qui est notifiable est tracé, et vice-versa.
 *
 * Tri sur `horodatage` (ISO millisecondes, posé explicitement à l'écriture)
 * et NON sur `creeLe` (résolution SQLite à la seconde) — bug corrigé, deux
 * événements du même workflow dans la même seconde s'affichaient dans le
 * désordre, inacceptable pour un journal destiné à un contrôle fiscal.
 */
@Entity('journal')
export class JournalEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  action!: string;

  @Column('int', { nullable: true })
  factureId?: number;

  @Column('int', { nullable: true })
  designationId?: number;

  /** Utilisateur ayant réellement effectué l'action (pas systématiquement le créateur d'origine). */
  @Column('int', { nullable: true })
  utilisateurId?: number;

  @Column({ nullable: true })
  saisiPar?: string;

  @Column({ nullable: true })
  lotId?: string;

  @Column({ type: 'text', nullable: true })
  details?: string;

  @Column({ default: false })
  notifiable!: boolean;

  /** ISO 8601 millisecondes, posé explicitement — voir note tri ci-dessus. */
  @Column()
  horodatage!: string;
}
