import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Extrait le payload JWT vérifié de la requête. Seule source légitime de
 * `utilisateurId`/`saisiPar` dans tout le backend — jamais un champ du
 * body envoyé par le client.
 */
export const UtilisateurCourant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as JwtPayload;
  },
);
