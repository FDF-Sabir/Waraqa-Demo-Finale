import { TwoFactorService } from "./two-factor.service";
import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AuthService, ReponseAuth, UtilisateurPublic } from './auth.service';
import { InscriptionDto } from './dto/inscription.dto';
import { ConnexionDto } from './dto/connexion.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UtilisateurCourant } from './utilisateur.decorator';
import { JwtPayload } from './jwt-payload.interface';

/**
 * Forme de réponse attendue par le frontend Lovable (waraqa-hub-main),
 * distincte de `ReponseAuth` (contrat backend d'origine, déjà testé).
 * Champ `access_token` en snake_case et `utilisateur.cle_api_anthropic`
 * (toujours null ici — la clé API Anthropic n'est jamais stockée côté
 * utilisateur final, elle reste une variable d'environnement serveur).
 */
export interface ReponseAuthCompat {
  access_token: string;
  utilisateur: {
    id: number;
    nom: string;
    email: string;
    cle_api_anthropic: null;
  };
}

function versCompat(reponse: ReponseAuth): ReponseAuthCompat {
  return {
    access_token: reponse.accessToken,
    utilisateur: {
      id: reponse.utilisateur.id,
      nom: reponse.utilisateur.nom,
      email: reponse.utilisateur.email,
      cle_api_anthropic: null,
    },
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly twoFactor: TwoFactorService) {}

  @UseGuards(JwtAuthGuard) @Get('2fa') status2fa(@UtilisateurCourant() u: JwtPayload) { return this.twoFactor.status(u.sub); }
  @UseGuards(JwtAuthGuard) @Post('2fa/begin') begin2fa(@UtilisateurCourant() u: JwtPayload, @Body() b: any) { return this.twoFactor.begin(u.sub,b.password); }
  @UseGuards(JwtAuthGuard) @Post('2fa/confirm') confirm2fa(@UtilisateurCourant() u: JwtPayload, @Body() b: any) { return this.twoFactor.confirm(u.sub,b.code); }
  @UseGuards(JwtAuthGuard) @Post('2fa/disable') disable2fa(@UtilisateurCourant() u: JwtPayload, @Body() b: any) { return this.twoFactor.disable(u.sub,b.password,b.code); }
  @Post('inscription')
  async inscription(@Body() dto: InscriptionDto): Promise<ReponseAuth> {
    return this.authService.inscrire(dto);
  }

  @Post('connexion')
  @HttpCode(200)
  async connexion(@Body() dto: ConnexionDto): Promise<ReponseAuth> {
    return this.authService.connecter(dto);
  }

  @Get('moi')
  @UseGuards(JwtAuthGuard)
  async moi(@UtilisateurCourant() utilisateur: JwtPayload): Promise<UtilisateurPublic | null> {
    return this.authService.trouverParId(utilisateur.sub);
  }

  // --- Routes de compatibilité pour le frontend waraqa-hub-main ---
  // Additives uniquement : réutilisent AuthService sans le modifier,
  // aucune des routes ci-dessus n'est touchée (zéro risque de régression
  // sur les 76 tests déjà passants).

  @Post('register')
  async register(@Body() dto: InscriptionDto): Promise<ReponseAuthCompat> {
    return versCompat(await this.authService.inscrire(dto));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: ConnexionDto): Promise<ReponseAuthCompat> {
    return versCompat(await this.authService.connecter(dto));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@UtilisateurCourant() utilisateur: JwtPayload): Promise<ReponseAuthCompat['utilisateur'] | null> {
    const trouve = await this.authService.trouverParId(utilisateur.sub);
    if (!trouve) return null;
    return {
      id: trouve.id,
      nom: trouve.nom,
      email: trouve.email,
      cle_api_anthropic: null,
    };
  }
}
