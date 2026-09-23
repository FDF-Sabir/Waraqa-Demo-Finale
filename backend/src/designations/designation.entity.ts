import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Référentiel DESIGNATION. Seed initial = 5 valeurs RÉELLEMENT observées
 * dans TVA_07_2026.xlsm (COMMISSION, SERVICE, GASOIL, ACHAT, RECEVEUR
 * DOUANE) — remplace l'ancien référentiel fictif. Reste CRUD et
 * nativement extensible : toute désignation nouvelle rencontrée par l'IA
 * passe par `enAttenteConfirmation` avant d'entrer dans le référentiel
 * confirmé (décision #6, decisions-finales-avant-cdc.md).
 */
@Entity('designations')
export class DesignationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  libelle!: string;

  /**
   * true = suggérée par l'IA, jamais encore validée par le comptable.
   * false = confirmée, utilisable normalement dans le référentiel.
   */
  @Column({ default: false })
  enAttenteConfirmation!: boolean;

  @CreateDateColumn()
  creeLe!: Date;
}
