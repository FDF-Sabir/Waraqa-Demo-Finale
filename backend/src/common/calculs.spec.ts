import {
  calculerHtEtTva,
  detecterDoublon,
  TauxInvalideError,
  validerTaux,
} from './calculs';

describe('validerTaux', () => {
  it('accepte les 5 taux légaux marocains', () => {
    expect(() => validerTaux(0)).not.toThrow();
    expect(() => validerTaux(0.07)).not.toThrow();
    expect(() => validerTaux(0.1)).not.toThrow();
    expect(() => validerTaux(0.14)).not.toThrow();
    expect(() => validerTaux(0.2)).not.toThrow();
  });

  it('rejette un taux non légal', () => {
    expect(() => validerTaux(0.15)).toThrow(TauxInvalideError);
    expect(() => validerTaux(0.25)).toThrow(TauxInvalideError);
    expect(() => validerTaux(-0.1)).toThrow(TauxInvalideError);
  });
});

describe('calculerHtEtTva', () => {
  it('calcule M_HT = M_TTC / (1 + TAUX) et TVA = M_HT * TAUX au taux 20%', () => {
    const resultat = calculerHtEtTva(1200, 0.2);
    expect(resultat.mHt).toBeCloseTo(1000, 2);
    expect(resultat.tva).toBeCloseTo(200, 2);
    expect(resultat.mTtc).toBeCloseTo(1200, 2);
  });

  it('calcule correctement au taux 10%', () => {
    const resultat = calculerHtEtTva(1100, 0.1);
    expect(resultat.mHt).toBeCloseTo(1000, 2);
    expect(resultat.tva).toBeCloseTo(100, 2);
  });

  it('calcule correctement au taux 0% (exonéré)', () => {
    const resultat = calculerHtEtTva(500, 0);
    expect(resultat.mHt).toBeCloseTo(500, 2);
    expect(resultat.tva).toBeCloseTo(0, 2);
  });

  it('calcule correctement au taux 7%', () => {
    const resultat = calculerHtEtTva(107, 0.07);
    expect(resultat.mHt).toBeCloseTo(100, 2);
    expect(resultat.tva).toBeCloseTo(7, 2);
  });

  it('calcule correctement au taux 14%', () => {
    const resultat = calculerHtEtTva(114, 0.14);
    expect(resultat.mHt).toBeCloseTo(100, 2);
    expect(resultat.tva).toBeCloseTo(14, 2);
  });

  it('gère des montants avec décimales sans dérive flottante', () => {
    const resultat = calculerHtEtTva(692000.5, 0.2);
    expect(resultat.mHt + resultat.tva).toBeCloseTo(resultat.mTtc, 2);
  });

  it('rejette un taux non légal même avec un montant valide', () => {
    expect(() => calculerHtEtTva(1000, 0.99)).toThrow(TauxInvalideError);
  });

  it('rejette un montant négatif', () => {
    expect(() => calculerHtEtTva(-100, 0.2)).toThrow();
  });

  it('rejette un montant non numérique', () => {
    expect(() => calculerHtEtTva(NaN, 0.2)).toThrow();
  });

  it("l'addition M_HT + TVA reconstitue toujours M_TTC (arrondi 2 décimales)", () => {
    for (const mTtc of [99.99, 1234.56, 690123.45, 16.5]) {
      const resultat = calculerHtEtTva(mTtc, 0.2);
      // Tolérance à 2 centimes : l'arrondi indépendant de M_HT et TVA à
      // 2 décimales peut légitimement laisser un écart d'un centime sur
      // certains montants (ex. répartition impaire), avant toute dérive
      // flottante résiduelle.
      expect(
        Math.abs(resultat.mHt + resultat.tva - resultat.mTtc),
      ).toBeLessThanOrEqual(0.02);
    }
  });
});

describe('detecterDoublon', () => {
  const existantes = [
    { id: 1, factNum: 'F-2026-001', iceFrs: '001234567000012', mTtc: 1200 },
    { id: 2, factNum: 'F-2026-002', iceFrs: '001234567000099', mTtc: 500 },
  ];

  it('détecte un doublon exact (même factNum, même ICE, même montant)', () => {
    const doublon = detecterDoublon(
      { factNum: 'F-2026-001', iceFrs: '001234567000012', mTtc: 1200 },
      existantes,
    );
    expect(doublon).not.toBeNull();
    expect(doublon?.id).toBe(1);
  });

  it('ne détecte pas de doublon si le montant diffère (même avec taux différent)', () => {
    const doublon = detecterDoublon(
      { factNum: 'F-2026-001', iceFrs: '001234567000012', mTtc: 1250 },
      existantes,
    );
    expect(doublon).toBeNull();
  });

  it('ne détecte pas de doublon si le fournisseur diffère', () => {
    const doublon = detecterDoublon(
      { factNum: 'F-2026-001', iceFrs: '999999999000099', mTtc: 1200 },
      existantes,
    );
    expect(doublon).toBeNull();
  });

  it('ne se compare jamais à soi-même lors d\'une mise à jour', () => {
    const doublon = detecterDoublon(
      { id: 1, factNum: 'F-2026-001', iceFrs: '001234567000012', mTtc: 1200 },
      existantes,
    );
    expect(doublon).toBeNull();
  });

  it('ignore les lignes sans factNum (ex. lignes bancaires orphelines)', () => {
    const doublon = detecterDoublon({ mTtc: 1200 }, existantes);
    expect(doublon).toBeNull();
  });

  it('reconnaît un doublon via IF si ICE absent', () => {
    const avecIf = [{ id: 3, factNum: 'F-2026-003', iff: '1111', mTtc: 690000 }];
    const doublon = detecterDoublon(
      { factNum: 'F-2026-003', iff: '1111', mTtc: 690000 },
      avecIf,
    );
    expect(doublon?.id).toBe(3);
  });

  it('est insensible à la casse sur factNum', () => {
    const doublon = detecterDoublon(
      { factNum: 'f-2026-001', iceFrs: '001234567000012', mTtc: 1200 },
      existantes,
    );
    expect(doublon?.id).toBe(1);
  });
});
