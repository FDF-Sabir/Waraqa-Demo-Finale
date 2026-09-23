import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';

/** Shared limits for OCR and chat. Test doubles are injected only by tests. */
export class IaGateway {
  private static active = 0;
  private client: Anthropic;
  constructor(apiKey: string, client?: Anthropic) {
    if (!apiKey) throw new ServiceUnavailableException('IA non configurée. Aucune requête externe effectuée.');
    this.client = client || new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  }
  async message(params: Anthropic.MessageCreateParamsNonStreaming, signal?: AbortSignal) {
    const limit = Math.max(1, Math.min(4, Number(process.env.WARAQA_IA_CONCURRENCY) || 1));
    if (IaGateway.active >= limit) throw new ServiceUnavailableException('IA occupée. Réessayez après le traitement en cours.');
    if (JSON.stringify(params).length > 25_000_000) throw new BadRequestException('Pièces jointes trop volumineuses pour cet appel.');
    IaGateway.active++;
    try {
      const result = await this.client.messages.create(params, { signal });
      if (result.stop_reason !== 'end_turn') {
        throw new BadGatewayException('Réponse IA incomplète ou refusée. Aucune extraction validée ; réduisez le périmètre puis réessayez.');
      }
      if (!result.content.some(b => b.type === 'text' && b.text.trim())) throw new BadGatewayException('Réponse IA vide.');
      return result;
    } catch (e: any) {
      if (e instanceof BadGatewayException) throw e;
      if (signal?.aborted) throw new ServiceUnavailableException('Traitement IA annulé. La réponse ne sera pas utilisée.');
      const reasons: Record<number, string> = {
        401: 'Clé IA refusée', 403: 'Accès au modèle refusé', 429: 'Quota ou limite du fournisseur atteint',
      };
      // Never return SDK messages, request bodies, keys or extracted text in diagnostics.
      throw new BadGatewayException((reasons[e?.status] || 'Fournisseur IA indisponible ou délai dépassé') + '. Votre document est conservé ; réessayez ultérieurement.');
    } finally { IaGateway.active--; }
  }
}
