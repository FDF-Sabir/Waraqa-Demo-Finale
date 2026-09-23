import { useEffect, useState } from 'react';
import { api } from './api';
import { type Run } from './App';
const targets: Record<string,string> = { factNum:'N° facture',libFrss:'Fournisseur',iceFrs:'ICE (texte)',iff:'IF (texte)',designation:'Désignation',mTtc:'TTC',taux:'Taux',dateFac:'Date facture',datePaie:'Date paiement',idPaie:'Mode paiement',sousType:'Sous-type',or:'Ordre' };
export default function ImportPreview({id,run,done}:{id:string;run:Run;done:()=>Promise<void>}) {
 const [data,setData]=useState<any>(),[mapping,setMapping]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
 useEffect(()=>{run(async()=>{const d=await api(`/workspace/documents/${id}/preview`);setData(d);setMapping(d.mapping);});},[id]);
 return <div className="u-form"><h3>Aperçu avant import</h3>
 {!data ? <p>Chargement…</p> : <><p>{data.total} lignes détectées. Aperçu des {data.lines.length} premières ; {data.errors.length} rejets détectés. Les lignes acceptées resteront à revoir.</p>
 <div className="formgrid">{data.columns.map((column:string)=><label key={column}>{column}<select aria-label={'Colonne '+column} value={mapping[column] ?? '__auto'} onChange={e=>{const m={...mapping}; if(e.target.value==='__auto')delete m[column];else m[column]=e.target.value;setMapping(m);}}><option value="__auto">Reconnaissance automatique</option><option value="">Ignorer</option>{Object.entries(targets).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>)}</div>
 <button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);await run(async()=>setData(await api(`/workspace/documents/${id}/mapping`,'PUT',{mapping})), 'Mapping mémorisé et aperçu recalculé');setBusy(false);}}>Mémoriser le mapping et recalculer</button>
 <div className="u-table-scroll"><table className="u-table"><thead><tr><th>Facture</th><th>Fournisseur</th><th>ICE</th><th>TTC</th><th>Taux</th></tr></thead><tbody>{data.lines.map((l:any,i:number)=><tr key={i}><td>{l.factNum || '—'}</td><td>{l.libFrss || '—'}</td><td>{l.iceFrs || '—'}</td><td>{l.mTtc ?? '—'}</td><td>{l.taux ?? '—'}</td></tr>)}</tbody></table></div>
 {data.errors.map((e:string)=><p className="u-info" key={e}>{e}</p>)}
 <button className="primary" disabled={busy} onClick={async()=>{setBusy(true);await run(async()=>{await api(`/workspace/documents/${id}/commit`,'POST');await done();},'Import confirmé — vérifier les lignes et les rejets');setBusy(false);}}>Confirmer l’import des lignes acceptées</button></>}
 </div>;
}
