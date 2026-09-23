import { IsBoolean, IsIn, IsOptional } from 'class-validator';

/**
 * DTO du corps de `PUT /reglages`, en snake_case (contrat frontend
 * `Reglages`, `src/lib/types.ts`) — distinct de `ModifierReglagesDto`
 * (camelCase, interne) pour que le `ValidationPipe` global
 * (`whitelist: true, forbidNonWhitelisted: true`) accepte ces clés.
 */
export class ReglagesCompatDto {
  @IsOptional()
  @IsIn(['hebdomadaire', 'bi_mensuel', 'fin_de_mois'])
  frequence_snapshot?: 'hebdomadaire' | 'bi_mensuel' | 'fin_de_mois';

  @IsOptional()
  @IsBoolean()
  notif_push_web?: boolean;

  @IsOptional()
  @IsBoolean()
  notif_email?: boolean;
}
