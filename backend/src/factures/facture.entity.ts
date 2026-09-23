import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { SousType, StatutFacture } from '../common/types';

/**
 * Une ligne de `Tableau5`. Les 13 champs de la table nommée (A-M) plus les
 * métadonnées de traçabilité (sous-type, statut, auteur réel, lot).
 *
 * `mHt` et `tva` sont TOUJOURS dérivés côté serveur par
 * `common/calculs.ts` — jamais acceptés en entrée brute (voir principe
 * "l'IA extrait, ne calcule jamais").
 */
@Entity('factures')
export class FactureEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  // --- Les 13 champs Tableau5 (colonnes A-M) ---
  @Column({ nullable: true })
  or?: string;

  @Column({ nullable: true })
  factNum?: string;

  @Column({ nullable: true })
  designation?: string;

  @Column('float', { nullable: true })
  mHt?: number;

  @Column('float', { nullable: true })
  tva?: number;

  @Column('float', { nullable: true })
  mTtc?: number;

  @Column({ nullable: true })
  iff?: string;

  @Column({ nullable: true })
  libFrss?: string;

  @Column({ nullable: true })
  iceFrs?: string;

  @Column('float', { nullable: true })
  taux?: number;

  @Column('int', { nullable: true })
  idPaie?: number;

  @Column({ nullable: true })
  datePaie?: string;

  @Column({ nullable: true })
  dateFac?: string;

  // --- Métadonnées de traçabilité et classification ---
  @Column({ type: 'varchar' })
  sousType!: SousType;

  @Column({ type: 'varchar', default: StatutFacture.VALIDEE })
  statut!: StatutFacture;

  @Column('simple-array', { nullable: true })
  champsManquants?: string[];

  @Column({ default: false })
  vigilanceRenforcee!: boolean;

  /** Utilisateur ayant réellement créé la ligne (token vérifié serveur). */
  @Column('int', { nullable: true })
  utilisateurId?: number;

  @Column({ nullable: true })
  saisiPar?: string;

  /** Identifiant de lot pour un dépôt groupé (voir services-a-developper.md). */
  @Column({ nullable: true })
  lotId?: string;

  @Column({ default: false })
  notifiable!: boolean;

  @Column({ nullable: true })
  documentId?: string;
  @Column({ default: false })
  revueHumaine!: boolean;
  @Column({ default: false })
  demonstration!: boolean;
  @Column({ default: false })
  archivee!: boolean;
  @Column('int', { nullable: true })
  doublonDe?: number;
  @Column('int', { nullable: true })
  rapprocheeA?: number;
  @VersionColumn() version!: number;
  @Column({ nullable: true }) importKey?: string;
  @Column('int', { nullable: true }) creditOf?: number;
  @Column({ nullable: true }) accountingMonth?: string;
  @Column({ nullable: true }) fiscalMonth?: string;
  @CreateDateColumn()
  creeLe!: Date;

  @UpdateDateColumn()
  modifieLe!: Date;
}
