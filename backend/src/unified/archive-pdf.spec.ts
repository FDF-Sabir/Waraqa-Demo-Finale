import { reportMetrics } from './archive-pdf';

describe('Synthèse des PDF', () => {
  it('conserve les avoirs négatifs et exclut les paiements des montants', () => {
    const metrics = reportMetrics([
      {libFrss:'A',mHt:100,tva:20,mTtc:120,sousType:'facture_fournisseur',revueHumaine:true,statut:'validee'},
      {libFrss:'A',mHt:-50,tva:-10,mTtc:-60,sousType:'facture_fournisseur',creditOf:1},
      {libFrss:'Banque',mTtc:5000,sousType:'releve_bancaire'},
      {libFrss:'Banque',mHt:10,tva:1,mTtc:11,sousType:'releve_bancaire',designation:'COMMISSION'},
      {libFrss:'B',mHt:-200,tva:-40,mTtc:-240,sousType:'facture_fournisseur',demonstration:true},
    ] as any);
    expect(metrics).toMatchObject({totalHt:-140,totalTva:-29,totalTtc:-169,bankCount:1,reviewed:1,examples:1});
    expect(metrics.suppliers).toEqual([{label:'B',amount:-240},{label:'A',amount:60},{label:'Banque',amount:11}]);
  });
  it('regroupe tous les fournisseurs restants sans perdre leur montant', () => {
    const rows = Array.from({length:10},(_,i)=>({libFrss:'F'+i,mTtc:(i+1)*0.1,sousType:'facture_fournisseur'}));
    const metrics = reportMetrics(rows as any);
    expect(metrics.totalTtc).toBe(5.5);
    expect(metrics.suppliers).toHaveLength(5);
    expect(metrics.suppliers[4]).toEqual({label:'Autres fournisseurs',amount:2.1});
    expect(reportMetrics([]).suppliers).toEqual([]);
  });
});
