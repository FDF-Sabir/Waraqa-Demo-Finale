import { IsEmail, IsString, MinLength } from 'class-validator';

export class InscriptionDto {
  @IsString()
  @MinLength(1)
  nom!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  motDePasse!: string;
}
