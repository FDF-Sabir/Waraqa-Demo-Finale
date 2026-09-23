import {
  ConflictException,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { InscriptionDto } from './dto/inscription.dto';
import { ConnexionDto } from './dto/connexion.dto';
import { JwtPayload } from './jwt-payload.interface';

const TOURS_BCRYPT = 12;

export interface UtilisateurPublic {
  id: number;
  nom: string;
  email: string;
  creeLe: Date;
  role: string;
}

export interface ReponseAuth {
  accessToken: string;
  utilisateur: UtilisateurPublic;
}

function versPublic(u: UtilisateurEntity): UtilisateurPublic {
  return { id: u.id, nom: u.nom, email: u.email, creeLe: u.creeLe, role: u.role };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UtilisateurEntity)
    private readonly utilisateurs: Repository<UtilisateurEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async inscrire(dto: InscriptionDto): Promise<ReponseAuth> {
    if (process.env.NODE_ENV !== 'test' && await this.utilisateurs.count() > 0) throw new ForbiddenException('Inscription fermée. Demandez un compte à votre administrateur.');
    const existant = await this.utilisateurs.findOne({ where: { email: dto.email } });
    if (existant) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const motDePasseHache = await bcrypt.hash(dto.motDePasse, TOURS_BCRYPT);
    const utilisateur = await this.utilisateurs.save(
      this.utilisateurs.create({
        role: (await this.utilisateurs.count()) === 0 ? 'admin' : 'comptable',
        nom: dto.nom,
        email: dto.email,
        motDePasseHache,
      }),
    );

    return this.emettreToken(utilisateur);
  }

  async connecter(dto: ConnexionDto): Promise<ReponseAuth> {
    const utilisateur = await this.utilisateurs.findOne({ where: { email: dto.email } });
    if (!utilisateur) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const motDePasseValide = await bcrypt.compare(
      dto.motDePasse,
      utilisateur.motDePasseHache,
    );
    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    return this.emettreToken(utilisateur);
  }

  async trouverParId(id: number): Promise<UtilisateurPublic | null> {
    const utilisateur = await this.utilisateurs.findOne({ where: { id } });
    return utilisateur ? versPublic(utilisateur) : null;
  }

  private emettreToken(utilisateur: UtilisateurEntity): ReponseAuth {
    const payload: JwtPayload = {
      sub: utilisateur.id,
      sessionVersion: utilisateur.sessionVersion,
      email: utilisateur.email,
      nom: utilisateur.nom,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      utilisateur: versPublic(utilisateur),
    };
  }
}
