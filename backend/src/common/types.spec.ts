import {
  ChampsBrutsTableau5,
  IdPaie,
  SousType,
  champsManquants,
  estFournisseurDouane,
  estLigneBancaireOrpheline,
  idPaieEstValide,
} from './types';

describe('idPaieEstValide', () => {
  it('accepte les codes DGI 1 à 7', () => {
    for (let i = 1; i <= 7; i++) {
      expect(idPaieEstValide(i)).toBe(true);
    }
  });

  it('rejette un code hors plage', () => {
    expect(idPaieEstValide(0)).toBe(false);
    expect(idPaieEstValide(8)).toBe(false);
  });
});

describe('estFournisseurDouane', () => {
  it('reconnaît "DOUANE" indépendamment de la casse', () => {
    expect(estFournisseurDouane('DROIT DOUANE')).toBe(true);
    expect(estFournisseurDouane('receveur douane')).toBe(true);
  });

  it('retourne false si absent', () => {
    expect(estFournisseurDouane('ORANGE SA')).toBe(false);
    expect(estFournisseurDouane(undefined)).toBe(false);
  });
});

describe('champsManquants — facture fournisseur', () => {
  it('signale factNum/iceFrs/dateFac/mTtc/libFrss manquants', () => {
    const manquants = champsManquants(SousType.FACTURE_FOURNISSEUR, {});
    expect(manquants).toEqual(
      expect.arrayContaining(['factNum', 'iceFrs', 'dateFac', 'mTtc', 'libFrss']),
    );
  });

  it('ne signale rien si tous les champs obligatoires sont présents', () => {
    const champs: ChampsBrutsTableau5 = {
      factNum: 'F-001',
      iceFrs: '001234567000012',
      dateFac: '2026-07-15',
      mTtc: 1200,
      libFrss: 'FOURNISSEUR SARL',
    };
    expect(champsManquants(SousType.FACTURE_FOURNISSEUR, champs)).toEqual([]);
  });
});

describe('champsManquants — déclaration douanière (exemption ICE)', () => {
  it('IF=ICE="1111" avec LIB_FRSS "DOUANE" ne compte pas comme manquant', () => {
    const champs: ChampsBrutsTableau5 = {
      factNum: 'DUM-2026-042',
      dateFac: '2026-07-20',
      mTtc: 690000,
      libFrss: ' DROIT DOUANE',
      iff: '1111',
      iceFrs: '1111',
    };
    expect(champsManquants(SousType.DECLARATION_DOUANIERE, champs)).toEqual([]);
  });

  it('signale factNum manquant même pour une déclaration douanière', () => {
    const champs: ChampsBrutsTableau5 = {
      dateFac: '2026-07-20',
      mTtc: 690000,
      libFrss: 'RECEVEUR DOUANE',
    };
    expect(champsManquants(SousType.DECLARATION_DOUANIERE, champs)).toContain('factNum');
  });
});

describe('champsManquants — note de frais (contrôle allégé)', () => {
  it('ne signale que mTtc manquant, jamais factNum/iceFrs', () => {
    const manquants = champsManquants(SousType.NOTE_DE_FRAIS, {});
    expect(manquants).toEqual(['mTtc']);
  });
});

describe('estLigneBancaireOrpheline', () => {
  it('détecte le pattern exact observé (L13/L38/L65/L69/L75 du fichier réel)', () => {
    const ligne: ChampsBrutsTableau5 = {
      factNum: undefined,
      designation: undefined,
      dateFac: undefined,
      datePaie: '2026-07-10',
      idPaie: IdPaie.VIREMENT,
      mTtc: 3200,
    };
    expect(estLigneBancaireOrpheline(ligne)).toBe(true);
  });

  it('ne détecte pas le pattern si factNum est présent', () => {
    const ligne: ChampsBrutsTableau5 = {
      factNum: 'F-001',
      datePaie: '2026-07-10',
      idPaie: IdPaie.VIREMENT,
    };
    expect(estLigneBancaireOrpheline(ligne)).toBe(false);
  });

  it('ne détecte pas le pattern si le mode de paiement n\'est pas virement', () => {
    const ligne: ChampsBrutsTableau5 = {
      datePaie: '2026-07-10',
      idPaie: IdPaie.ESPECES,
    };
    expect(estLigneBancaireOrpheline(ligne)).toBe(false);
  });

  it('ne détecte pas le pattern si datePaie est absente', () => {
    const ligne: ChampsBrutsTableau5 = {
      idPaie: IdPaie.VIREMENT,
    };
    expect(estLigneBancaireOrpheline(ligne)).toBe(false);
  });

  it('reste détectable même quand champsManquants ne rend rien pour ce sous-type (bug corrigé)', () => {
    // avis_debit_virement ne rend obligatoires que mTtc/datePaie — donc
    // champsManquants peut être vide alors que le pattern orphelin existe.
    const ligne: ChampsBrutsTableau5 = {
      mTtc: 3200,
      datePaie: '2026-07-10',
      idPaie: IdPaie.VIREMENT,
    };
    const manquants = champsManquants(SousType.AVIS_DEBIT_VIREMENT, ligne);
    expect(manquants).toEqual([]);
    expect(estLigneBancaireOrpheline(ligne)).toBe(true);
  });
});
