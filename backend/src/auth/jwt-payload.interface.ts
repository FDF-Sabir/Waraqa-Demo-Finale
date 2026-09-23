export interface JwtPayload {
  sessionVersion?: number;
  sub: number; // utilisateurId
  email: string;
  nom: string;
}
