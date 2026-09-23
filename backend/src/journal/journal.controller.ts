import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JournalService } from './journal.service';
import { JournalEntity } from './journal.entity';

/**
 * Route de compatibilité pour le frontend waraqa-hub-main
 * (`GET /journal`). Le journal existait déjà comme service interne
 * consommé par factures/designations ; cette route l'expose en lecture
 * seule, sans toucher à `JournalService`.
 */
@Controller('journal')
@UseGuards(JwtAuthGuard)
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  async lister(): Promise<JournalEntity[]> {
    return this.journalService.listerTout();
  }
}
