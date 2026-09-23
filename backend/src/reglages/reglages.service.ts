import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReglageEntity } from './reglage.entity';
import { ModifierReglagesDto } from './dto/modifier-reglages.dto';

@Injectable()
export class ReglagesService {
  constructor(
    @InjectRepository(ReglageEntity)
    private readonly repo: Repository<ReglageEntity>,
  ) {}

  /** Crée la ligne avec les valeurs par défaut au premier accès — jamais de 404 sur GET /reglages. */
  async obtenirOuCreer(utilisateurId: number): Promise<ReglageEntity> {
    const existant = await this.repo.findOne({ where: { utilisateurId } });
    if (existant) return existant;
    const cree = this.repo.create({ utilisateurId });
    return this.repo.save(cree);
  }

  /** N'écrase que les champs explicitement fournis (sémantique PATCH partielle) — un champ omis (`undefined`) reste inchangé. */
  async modifier(utilisateurId: number, dto: ModifierReglagesDto): Promise<ReglageEntity> {
    const reglage = await this.obtenirOuCreer(utilisateurId);
    if (dto.frequenceSnapshot !== undefined) reglage.frequenceSnapshot = dto.frequenceSnapshot;
    if (dto.notifPushWeb !== undefined) reglage.notifPushWeb = dto.notifPushWeb;
    if (dto.notifEmail !== undefined) reglage.notifEmail = dto.notifEmail;
    return this.repo.save(reglage);
  }
}
