import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Authentification multi-utilisateur (1 à N personnes) — remplace le
 * `saisiPar` en dur de la V1 initiale. Le mot de passe est haché (bcrypt,
 * 12 tours), jamais stocké ni retourné en clair.
 */
@Entity('utilisateurs')
@Unique(['email'])
export class UtilisateurEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  nom!: string;

  @Column()
  email!: string;

  @Column()
  motDePasseHache!: string;

  @Column({ default: 'comptable' })
  role!: string;

  @Column({ default: 0 })
  sessionVersion!: number;
  @CreateDateColumn()
  creeLe!: Date;
}
