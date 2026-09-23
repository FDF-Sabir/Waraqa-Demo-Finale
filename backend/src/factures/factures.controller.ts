import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UtilisateurCourant } from '../auth/utilisateur.decorator';
import { JwtPayload } from '../auth/jwt-payload.interface';
import { FacturesService } from './factures.service';
import { FactureEntity } from './facture.entity';
import { CreerFactureDto } from './dto/creer-facture.dto';
import { ModifierFactureDto } from './dto/modifier-facture.dto';

@Controller('factures')
@UseGuards(JwtAuthGuard)
export class FacturesController {
  constructor(private readonly facturesService: FacturesService) {}

  @Get()
  async lister(@Query('mois') mois?: string): Promise<FactureEntity[]> {
    // Ajout additif : sans ?mois, comportement strictement inchangé
    // (utilisé tel quel par les 26 tests e2e déjà passants).
    if (mois) {
      return this.facturesService.listerParMois(mois);
    }
    return this.facturesService.lister();
  }

  @Get(':id')
  async trouver(@Param('id', ParseIntPipe) id: number): Promise<FactureEntity> {
    return this.facturesService.trouver(id);
  }

  @Post()
  async creer(
    @Body() dto: CreerFactureDto,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<FactureEntity> {
    return this.facturesService.creer(dto, {
      utilisateurId: utilisateur.sub,
      saisiPar: utilisateur.nom,
    });
  }

  @Put(':id')
  async modifier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFactureDto,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<FactureEntity> {
    return this.facturesService.modifier(id, dto, {
      utilisateurId: utilisateur.sub,
      saisiPar: utilisateur.nom,
    });
  }

  @Post(':id/confirmer-sans-facture')
  async confirmerSansFacture(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<FactureEntity> {
    return this.facturesService.confirmerSansFacture(id, {
      utilisateurId: utilisateur.sub,
      saisiPar: utilisateur.nom,
    });
  }

  // --- Routes de compatibilité pour le frontend waraqa-hub-main ---

  /** Alias de PUT :id — même comportement, verbe HTTP différent attendu côté frontend. */
  @Patch(':id')
  async modifierPatch(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModifierFactureDto,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<FactureEntity> {
    return this.facturesService.modifier(id, dto, {
      utilisateurId: utilisateur.sub,
      saisiPar: utilisateur.nom,
    });
  }

  @Post(':id/valider')
  async valider(
    @Param('id', ParseIntPipe) id: number,
    @UtilisateurCourant() utilisateur: JwtPayload,
  ): Promise<FactureEntity> {
    return this.facturesService.validerLigne(id, {
      utilisateurId: utilisateur.sub,
      saisiPar: utilisateur.nom,
    });
  }
}
