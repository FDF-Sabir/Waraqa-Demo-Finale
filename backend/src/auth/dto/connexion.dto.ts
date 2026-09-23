import { IsOptional, MaxLength } from "class-validator";
import { IsEmail, IsString } from 'class-validator';

export class ConnexionDto {
  @IsOptional() @IsString() @MaxLength(64) otp?: string;
  @IsEmail()
  email!: string;

  @IsString()
  motDePasse!: string;
}
