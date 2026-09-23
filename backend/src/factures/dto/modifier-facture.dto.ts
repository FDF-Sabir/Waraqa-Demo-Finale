import { IsInt, IsOptional, Min } from "class-validator";
import { PartialType } from '@nestjs/mapped-types';
import { CreerFactureDto } from './creer-facture.dto';

export class ModifierFactureDto extends PartialType(CreerFactureDto) {
 @IsOptional() @IsInt() @Min(1) expectedVersion?: number;
}
