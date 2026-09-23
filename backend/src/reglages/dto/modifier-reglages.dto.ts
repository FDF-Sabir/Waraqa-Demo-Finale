import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class ModifierReglagesDto {
  @IsOptional()
  @IsIn(['hebdomadaire', 'bi_mensuel', 'fin_de_mois'])
  frequenceSnapshot?: 'hebdomadaire' | 'bi_mensuel' | 'fin_de_mois';

  @IsOptional()
  @IsBoolean()
  notifPushWeb?: boolean;

  @IsOptional()
  @IsBoolean()
  notifEmail?: boolean;
}
