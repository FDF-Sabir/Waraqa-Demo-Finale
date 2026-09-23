import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

export type IaStopReason = NonNullable<Anthropic.Message['stop_reason']>;

export interface IaCallOptions {
  /** Raisons d'arrêt acceptées. Par défaut : réponse complète uniquement. */
  stopReasons?: IaStopReason[];
  /** Appelé après chaque réponse réussie, pour la comptabilité des tokens. */
  onUsage?: (usage: Anthropic.Usage, model: string) => unknown;
}

/**
 * Point de passage unique vers Anthropic (chat, extraction, test de connexion).
 *
 * - Clé lue côté serveur uniquement ; jamais renvoyée ni journalisée.
 * - Concurrence bornée (WARAQA_IA_CONCURRENCY, 1 à 4).
 * - Reprises automatiques du SDK sur 429/5xx (maxRetries), délai borné.
 * - Si un paramètre optionnel (effort, thinking, format structuré) est refusé par
 *   le modèle choisi, un seul nouvel essai est fait sans ces options : l'application
 *   reste utilisable avec un modèle plus ancien choisi dans les réglages.
 * - Les messages d'erreur du fournisseur ne sont jamais recopiés tels quels (ils
 *   peuvent citer un document) : ils sont traduits en causes connues.
 */
export class IaGateway {
  private static active = 0;
  /** Réservé aux tests automatisés : aucun appel réseau n'est possible avec ce client. */
  static testClientFactory: (() => any) | null = null;
  private client: Anthropic;
  constructor(apiKey: string, client?: Anthropic) {
    if (!apiKey) throw new ServiceUnavailableException('IA non configurée. Aucune requête externe effectuée.');
    const injected = client || (process.env.NODE_ENV === 'test' && IaGateway.testClientFactory ? IaGateway.testClientFactory() : undefined);
    this.client = injected || new Anthropic({
      apiKey,
      timeout: Number(process.env.WARAQA_IA_TIMEOUT_MS) || 180_000,
      maxRetries: 2,
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
    });
  }

  static get busy() { return IaGateway.active; }

  async message(params: Anthropic.MessageCreateParamsNonStreaming, signal?: AbortSignal, options: IaCallOptions = {}) {
    const limit = Math.max(1, Math.min(4, Number(process.env.WARAQA_IA_CONCURRENCY) || 1));
    if (IaGateway.active >= limit) throw new ServiceUnavailableException('IA occupée. Réessayez après le traitement en cours.');
    if (JSON.stringify(params).length > 25_000_000) throw new BadRequestException('Pièces jointes trop volumineuses pour cet appel.');
    IaGateway.active++;
    try {
      let result: Anthropic.Message;
      try {
        result = await this.client.messages.create(params, { signal });
      } catch (e: any) {
        const optional = ['output_config', 'thinking'].filter(k => (params as any)[k] !== undefined);
        if (e?.status === 400 && optional.length && !signal?.aborted && IaGateway.optionRejected(e)) {
          const reduced: any = { ...params };
          for (const k of optional) delete reduced[k];
          result = await this.client.messages.create(reduced, { signal });
        } else throw e;
      }
      const accepted = options.stopReasons || ['end_turn'];
      if (options.onUsage && result.usage) await options.onUsage(result.usage, String(params.model));
      if (!result.stop_reason || !accepted.includes(result.stop_reason)) {
        if (result.stop_reason === 'refusal') throw new BadGatewayException('Le modèle a refusé de traiter cette demande. Reformulez ou retirez la pièce concernée.');
        throw new BadGatewayException('Réponse IA incomplète ou refusée. Aucune extraction validée ; réduisez le périmètre puis réessayez.');
      }
      if (result.stop_reason !== 'tool_use' && !result.content.some(b => b.type === 'text' && b.text.trim()))
        throw new BadGatewayException('Réponse IA vide.');
      return result;
    } catch (e: any) {
      if (e instanceof BadGatewayException || e instanceof BadRequestException) throw e;
      if (signal?.aborted) throw new ServiceUnavailableException('Traitement IA annulé. La réponse ne sera pas utilisée.');
      throw new BadGatewayException(IaGateway.describe(e) + '. Votre document est conservé ; réessayez ultérieurement.');
    } finally { IaGateway.active--; }
  }

  /** Test de connexion : vérifie la clé et l'accès au modèle sans générer de texte. */
  async checkModel(model: string) {
    try {
      const info: any = await (this.client as any).models.retrieve(model);
      return { id: info?.id || model, displayName: info?.display_name || model };
    } catch (e: any) {
      throw new BadGatewayException(IaGateway.describe(e) + '.');
    }
  }

  private static providerText(e: any): string {
    return String(e?.error?.error?.message || e?.error?.message || '').toLowerCase();
  }

  private static optionRejected(e: any) {
    const t = IaGateway.providerText(e);
    return /effort|thinking|output_config|output format|json_schema|schema|structured|not supported|unsupported|extra inputs/.test(t);
  }

  /** Traduit une erreur fournisseur en cause compréhensible, sans recopier son texte. */
  static describe(e: any): string {
    const t = IaGateway.providerText(e);
    if (/credit balance|billing|purchase credits/.test(t)) return 'Crédit API insuffisant : ajoutez des crédits dans la Console Claude (Billing) de l’organisation de la clé';
    if (/workspace/.test(t)) return 'Clé liée à une autre portée : créez une clé rattachée à un espace de travail (workspace « Default »)';
    if (/prompt is too long|context window|too many tokens/.test(t)) return 'Contexte trop long pour le modèle : sélectionnez moins de pièces ou posez une question plus ciblée';
    const reasons: Record<number, string> = {
      400: 'Requête refusée par le fournisseur (paramètre ou modèle non accepté)',
      401: 'Clé IA refusée (clé invalide, expirée ou supprimée)',
      403: 'Accès au modèle refusé pour cette clé',
      404: 'Modèle introuvable pour ce compte : vérifiez l’identifiant du modèle',
      413: 'Requête trop volumineuse : réduisez les pièces jointes',
      429: 'Quota ou limite de débit du fournisseur atteint',
      529: 'Fournisseur IA temporairement surchargé',
    };
    return reasons[e?.status] || 'Fournisseur IA indisponible ou délai dépassé';
  }
}
