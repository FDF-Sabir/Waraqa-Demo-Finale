import { PartialType } from '@nestjs/mapped-types';
import { CreerFactureDto } from './creer-facture.dto';

export class ModifierFactureDto extends PartialType(CreerFactureDto) {}
