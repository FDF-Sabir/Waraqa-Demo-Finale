import { IsIn, IsNumber, IsOptional, IsString, Min, ValidateIf, Matches, MaxLength } from 'class-validator';
import { SousType } from '../../common/types';

/**
 * DTO d'entrée — représente les CHAMPS BRUTS issus d'une extraction
 * (IA ou saisie manuelle). mHt/tva ne figurent jamais ici : ils sont
 * calculés côté serveur (common/calculs.ts), jamais acceptés en entrée.
 */
export class CreerFactureDto {
  @IsOptional()
  @IsString()
  or?: string;

  @IsOptional()
  @IsString()
  factNum?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsNumber()
  @Min(0)
  mTtc!: number;

  @IsOptional()
  @IsString()
  iff?: string;

  @IsOptional()
  @IsString()
  libFrss?: string;

  @IsOptional()
  @IsString()
  iceFrs?: string;

  @IsNumber()
  taux!: number;

  @IsOptional()
  @IsNumber()
  idPaie?: number;

  @IsOptional()
  @IsString()
  @ValidateIf((_o, v) => v !== '' && v !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'datePaie doit être une date ISO AAAA-MM-JJ' })
  datePaie?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_o, v) => v !== '' && v !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'dateFac doit être une date ISO AAAA-MM-JJ' })
  dateFac?: string;

  @IsIn(Object.values(SousType))
  sousType!: SousType;

  @IsOptional()
  @IsString()
  lotId?: string;
}
