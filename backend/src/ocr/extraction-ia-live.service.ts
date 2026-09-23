import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ChampsBrutsTableau5, SousType } from '../common/types';
import { ResultatExtraction } from './resultat-extraction.interface';
import { ContenuPrepare } from './preparation-contenu';
import {
  PROMPT_SYSTEME,
  PROMPT_UTILISATEUR_IMAGE,
  construirePromptUtilisateurTexte,
} from './prompt-extraction';

// Alias stable — décision actée (decisions-finales-avant-cdc.md §1).
// Ne pas figer sur un identifiant daté : l'alias suit automatiquement
// les mises à jour mineures du modèle décidées par Anthropic.
const MODELE = 'claude-sonnet-5';
const MAX_TOKENS_SORTIE = 4096;

/**
 * Champs que le modèle a le droit de produire — garde-fou explicite :
 * si jamais le modèle renvoyait mHt/tva malgré le prompt, on les élimine
 * ici avant qu'ils n'entrent dans le pipeline. Principe non négociable :
 * l'IA extrait, elle ne calcule JAMAIS.
 */
const CHAMPS_AUTORISES: (keyof ChampsBrutsTableau5)[] = [
  'or',
  'factNum',
  'designation',
  'mTtc',
  'iff',
  'libFrss',
  'iceFrs',
  'taux',
  'idPaie',
  'datePaie',
  'dateFac',
];

interface ReponseModeleBrute {
  sousType: string;
  confiance: number;
  lignes: Record<string, unknown>[];
}

/**
 * Implémentation réelle de la tâche #10 — un seul appel Claude Sonnet 5
 * en sortie, que le contenu source soit une image (vision) ou du texte
 * (tabulaire/PDF natif extrait par `preparation-contenu.ts`).
 *
 * Isolée et remplaçable (même principe que l'ancien stub `ocr.service.ts`)
 * pour ne jamais fermer la porte à un futur passage au Scénario B
 * (modèle entraîné en interne) si nécessaire — voir
 * `cdc-scenarios-ia-api-vs-modele-entraine.md`.
 */
@Injectable()
export class ExtractionIaLiveService {
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model = process.env.WARAQA_IA_MODEL || MODELE) {
    this.client = new Anthropic({ apiKey, timeout: 60000, maxRetries: 1 });
  }

  async extraire(contenu: ContenuPrepare, _nomFichier: string): Promise<ResultatExtraction> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS_SORTIE,
      system: PROMPT_SYSTEME,
      messages: [
        {
          role: 'user',
          content: this.construireContenuMessage(contenu),
        },
      ],
    });

    const blocTexte = message.content.find((bloc) => bloc.type === 'text');
    if (!blocTexte || blocTexte.type !== 'text') {
      throw new InternalServerErrorException(
        "Réponse IA vide ou inattendue — aucun bloc texte dans la réponse de l'API Anthropic.",
      );
    }

    return this.parserReponse(blocTexte.text);
  }

  private construireContenuMessage(contenu: ContenuPrepare): Anthropic.MessageParam['content'] {
    if (contenu.type === 'image') {
      const mediaType = (contenu.mimeType ?? 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp';

      if (contenu.mimeType === 'application/pdf') {
        return [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: contenu.imageBase64!,
            },
          },
          { type: 'text', text: PROMPT_UTILISATEUR_IMAGE },
        ];
      }

      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: contenu.imageBase64!,
          },
        },
        { type: 'text', text: PROMPT_UTILISATEUR_IMAGE },
      ];
    }

    return [{ type: 'text', text: construirePromptUtilisateurTexte(contenu.texte ?? '') }];
  }

  /**
   * Parse la réponse JSON du modèle et filtre strictement les champs
   * autorisés — garde-fou anti mHt/tva même en cas de dérive du modèle.
   */
  private parserReponse(texteBrut: string): ResultatExtraction {
    const jsonNettoye = this.extraireJson(texteBrut);
    let brute: ReponseModeleBrute;
    try {
      brute = JSON.parse(jsonNettoye);
    } catch (erreur) {
      throw new InternalServerErrorException(
        `Réponse IA non parsable en JSON : ${(erreur as Error).message}`,
      );
    }

    if (!Object.values(SousType).includes(brute.sousType as SousType)) {
      throw new InternalServerErrorException(
        `Sous-type IA invalide : "${brute.sousType}" n'est pas un sous-type reconnu.`,
      );
    }

    if(!Array.isArray(brute.lignes)||brute.lignes.length>2000) throw new InternalServerErrorException('Liste de lignes IA invalide.');
    const lignes = brute.lignes.map((ligne) => this.filtrerChamps(ligne));

    return {
      sousType: brute.sousType as SousType,
      confiance: typeof brute.confiance === 'number' ? brute.confiance : 0.5,
      lignes,
    };
  }

  private filtrerChamps(ligne: Record<string, unknown>): ChampsBrutsTableau5 {
    const resultat: ChampsBrutsTableau5 = {};
    for (const champ of CHAMPS_AUTORISES) {
      if (ligne[champ] !== undefined && ligne[champ] !== null && ligne[champ] !== '') {
        (resultat as Record<string, unknown>)[champ] = ligne[champ];
      }
    }
    return resultat;
  }

  /** Le modèle répond parfois avec un bloc ```json ... ``` malgré la consigne. */
  private extraireJson(texte: string): string {
    const matchBloc = texte.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (matchBloc) return matchBloc[1].trim();
    return texte.trim();
  }
}
