import { IsRealDate } from "../../common/date-validation";
import { IsIn, IsNumber, IsOptional, IsString, Min, ValidateIf, Matches, MaxLength, Max, IsInt } from 'class-validator';
import { SousType } from '../../common/types';

/**
 * DTO d'entrée — représente les CHAMPS BRUTS issus d'une extraction
 * (IA ou saisie manuelle). mHt/tva ne figurent jamais ici : ils sont
 * calculés côté serveur (common/calculs.ts), jamais acceptés en entrée.
 */
export class CreerFactureDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  or?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  factNum?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  designation?: string;

  @IsNumber()
  @Min(-999999999)
  @Max(999999999)
  mTtc!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  iff?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  libFrss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  iceFrs?: string;

  @IsNumber()
  taux!: number;

  @IsOptional()
  @IsNumber()
  idPaie?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ValidateIf((_o, v) => v !== '' && v !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'datePaie doit être une date ISO AAAA-MM-JJ' })
  @IsRealDate()
  datePaie?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ValidateIf((_o, v) => v !== '' && v !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'dateFac doit être une date ISO AAAA-MM-JJ' })
  @IsRealDate()
  dateFac?: string;

  @IsIn(Object.values(SousType))
  sousType!: SousType;

  @IsOptional() @IsInt() @Min(1) creditOf?: number;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) accountingMonth?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) fiscalMonth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lotId?: string;
}
