import { Repository } from 'typeorm';
import { UtilisateurEntity } from '../utilisateurs/utilisateur.entity';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';

/**
 * `saisiPar`/`utilisateurId` proviennent TOUJOURS du token vérifié côté
 * serveur ici, jamais d'un champ envoyé par le client — même principe
 * que "l'IA extrait, ne calcule jamais" appliqué à l'identité.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(secret: string, private readonly users?: Repository<UtilisateurEntity>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (this.users) {
      const user = await this.users.findOneBy({ id: payload.sub });
      if (!user || user.sessionVersion !== (payload.sessionVersion ?? 0)) throw new UnauthorizedException('Session expirée.');
    }
    return payload;
  }
}
