import { Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant } from '../auth/utilisateur.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { NotificationsService, NotificationVue } from './notifications.service';

/**
 * Notifications actionnables (#14, services-a-developper.md) — vue par
 * utilisateur au-dessus des entrées de journal `notifiable: true` (doublons,
 * vigilance renforcée, lignes orphelines, désignations IA en attente).
 * Le transport (push web, email) n'est pas câblé ici : voir la note dans
 * NotificationsService.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async lister(
    @UtilisateurCourant() utilisateur: JwtPayload,
    @Query('non_lues') nonLues?: string,
  ): Promise<NotificationVue[]> {
    if (nonLues === 'true') {
      return this.notificationsService.listerNonLues(utilisateur.sub);
    }
    return this.notificationsService.lister(utilisateur.sub);
  }

  @Post(':id/marquer-lue')
  async marquerLue(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<NotificationVue> {
    return this.notificationsService.marquerLue(id, utilisateur.sub);
  }

  @Post(':id/marquer-traitee')
  async marquerTraitee(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<NotificationVue> {
    return this.notificationsService.marquerTraitee(id, utilisateur.sub);
  }
}
