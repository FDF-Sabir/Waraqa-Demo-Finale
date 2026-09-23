import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant } from '../auth/utilisateur.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { ReglagesService } from './reglages.service';
import { ModifierReglagesDto } from './dto/modifier-reglages.dto';
import { ReglagesCompatDto } from './dto/reglages-compat.dto';
import { ReglageEntity } from './reglage.entity';

/**
 * Route de compatibilité pour le frontend waraqa-hub-main (`GET`/`PUT
 * /reglages`) — n'existait pas dans le contrat backend d'origine. Champs
 * exposés en snake_case (contrat `Reglages` du frontend, `src/lib/types.ts`),
 * traduits depuis l'entité camelCase (`ReglageEntity`) à la frontière —
 * même principe que les autres routes de compatibilité (voir
 * `architecture/mapping-frontend-backend.md`).
 */
export interface ReglagesCompat {
  frequence_snapshot: 'hebdomadaire' | 'bi_mensuel' | 'fin_de_mois';
  notif_push_web: boolean;
  notif_email: boolean;
}

function versCompat(r: ReglageEntity): ReglagesCompat {
  return {
    frequence_snapshot: r.frequenceSnapshot,
    notif_push_web: r.notifPushWeb,
    notif_email: r.notifEmail,
  };
}

@Controller('reglages')
@UseGuards(JwtAuthGuard)
export class ReglagesController {
  constructor(private readonly reglagesService: ReglagesService) {}

  @Get()
  async lire(@UtilisateurCourant() utilisateur: JwtPayload): Promise<ReglagesCompat> {
    const r = await this.reglagesService.obtenirOuCreer(utilisateur.sub);
    return versCompat(r);
  }

  @Put()
  async modifier(
    @UtilisateurCourant() utilisateur: JwtPayload,
    @Body() body: ReglagesCompatDto,
  ): Promise<ReglagesCompat> {
    const dto: ModifierReglagesDto = {
      frequenceSnapshot: body.frequence_snapshot,
      notifPushWeb: body.notif_push_web,
      notifEmail: body.notif_email,
    };
    const r = await this.reglagesService.modifier(utilisateur.sub, dto);
    return versCompat(r);
  }
}
