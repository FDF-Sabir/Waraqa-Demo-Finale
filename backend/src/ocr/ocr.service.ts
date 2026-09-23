import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { preparerContenu } from './preparation-contenu';
import { ExtractionIaMockService } from './extraction-ia-mock.service';
import { ExtractionIaLiveService } from './extraction-ia-live.service';
import { ResultatExtraction } from './resultat-extraction.interface';

export { ResultatExtraction } from './resultat-extraction.interface';

/**
 * Service de classification + extraction IA universel — tâche #10.
 *
 * Remplace le stub d'origine. Reste isolé et remplaçable (même principe
 * qu'avant) : la façade `OcrService` ne change jamais de contrat public
 * quel que soit le mode actif, pour ne jamais fermer la porte à un futur
 * passage au Scénario B (modèle entraîné en interne) si nécessaire.
 *
 * Mode piloté par `WARAQA_IA_MODE` :
 *   - "mock" (ou absent, ou clé API absente) : aucun appel réseau, utile
 *     tant qu'aucune clé API réelle n'est fournie, et en permanence pour
 *     les tests automatisés.
 *   - "live" : appel réel à Claude Sonnet 5 via `ExtractionIaLiveService`.
 *
 * Le tri déterministe (extension, PDF texte extractible ou non) reste
 * strictement le même dans les deux modes — c'est `preparation-contenu.ts`
 * qui décide comment présenter le contenu, jamais ce service.
 */
@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly modeEnvVar: string | undefined;
  private readonly apiKey: string | undefined;
  private serviceLive: ExtractionIaLiveService | null = null;

  constructor(private readonly config: ConfigService) {
    this.modeEnvVar = this.config.get<string>('WARAQA_IA_MODE');
    this.apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
  }

  private get modeActif(): 'mock' | 'live' {
    if (this.modeEnvVar === 'live') {
      if (!this.apiKey) {
        this.logger.warn(
          'WARAQA_IA_MODE=live mais ANTHROPIC_API_KEY est absente — bascule automatique en mode mock.',
        );
        return 'mock';
      }
      return 'live';
    }
    return 'mock';
  }

  async extraire(fichier: Buffer, nomFichier: string): Promise<ResultatExtraction> {
    if (process.env.NODE_ENV !== 'test' && (this.modeEnvVar !== 'live' || !this.apiKey)) {
      throw new ServiceUnavailableException('OCR connecté indisponible. Importez via Pièces pour conserver le document et saisir les lignes manuellement. Aucune extraction simulée.');
    }
    const contenu = await preparerContenu(fichier, nomFichier);

    if (this.modeActif === 'live') {
      if (!this.serviceLive) {
        this.serviceLive = new ExtractionIaLiveService(this.apiKey!);
      }
      return this.serviceLive.extraire(contenu, nomFichier);
    }

    const mock = new ExtractionIaMockService();
    return mock.extraire(contenu, nomFichier);
  }
}
