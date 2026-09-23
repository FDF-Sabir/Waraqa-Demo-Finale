import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant } from '../auth/utilisateur.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { DesignationsService } from './designations.service';
import { DesignationEntity } from './designation.entity';

@Controller('designations')
@UseGuards(JwtAuthGuard)
export class DesignationsController {
  constructor(private readonly designationsService: DesignationsService) {}

  @Get()
  async lister(): Promise<DesignationEntity[]> {
    return this.designationsService.lister();
  }

  @Get('en-attente')
  async listerEnAttente(): Promise<DesignationEntity[]> {
    return this.designationsService.listerEnAttente();
  }

  @Post(':id/confirmer')
  async confirmer(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<DesignationEntity> {
    return this.designationsService.confirmer(id, utilisateur.sub, utilisateur.nom);
  }
}
