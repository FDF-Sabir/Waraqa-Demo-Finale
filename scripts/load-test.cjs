const {spawn}=require('node:child_process');
const {mkdtemp,rm,writeFile}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),tmp=await mkdtemp(path.join(tmpdir(),'waraqa-load-')),base='http://127.0.0.1:3139/api';
 const child=spawn(process.execPath,['dist/main.js'],{cwd:path.join(root,'backend'),env:{...process.env,NODE_ENV:'production',WARAQA_DB_PATH:path.join(tmp,'db.sqlite'),WARAQA_FILES_PATH:path.join(tmp,'files'),WARAQA_PORT:'3139',WARAQA_JWT_SECRET:'load-test-only',ANTHROPIC_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let token='',logs='',report={date:new Date().toISOString(),synthetic:true,thresholds:{import10000Ms:180000,readP95Ms:1500,exportMs:10000,rssMb:1500},stages:[]};
 child.stderr.on('data',b=>{logs+=b;});
 const request=async(url,method='GET',body)=>{const start=performance.now(),r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const bytes=Buffer.from(await r.arrayBuffer());assert(r.ok,`${url} ${r.status} ${bytes.toString().slice(0,200)}`);return {ms:performance.now()-start,bytes,data:()=>JSON.parse(bytes)};};
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),20000);child.stdout.on('data',b=>{if(b.toString().includes('Waraqa backend démarré')){clearTimeout(t);resolve();}});child.on('exit',()=>{clearTimeout(t);reject(Error('Server stopped '+logs));});});
  token=(await request('/auth/inscription','POST',{nom:'Charge fictive',email:'load@example.test',motDePasse:'LoadTest2026!'})).data().accessToken;
  let total=0;
  for(const count of [100,1000,10000]){
   const csv='FACT_NUM;M_TTC;TAUX;ICE_FRS;LIB_FRSS;DATE_FAC\n'+Array.from({length:count},(_,i)=>`LOAD-${count}-${i};120;20;000123456000012;Fictif ${i%25};2026-09-01`).join('\n');
   const form=new FormData();form.append('file',new Blob([csv],{type:'text/csv'}),`load-${count}.csv`);
   const imported=await request('/workspace/documents','POST',form);assert.equal(imported.data().data.invoiceIds.length,count);assert.equal(imported.data().data.errors.length,0);total+=count;
   const times=[];for(let wave=0;wave<3;wave++){const batch=await Promise.all(Array.from({length:4},(_,i)=>request('/workspace/invoices?month=2026-09&page='+(i+1)+'&size=15')));for(const r of batch){assert.equal(r.data().total,total);times.push(r.ms);}}
   times.sort((a,b)=>a-b);
   const exported=await request('/workspace/export?month=2026-09&format=xlsx&scope=all');
   const diagnostic=(await request('/workspace/diagnostics')).data();
   const result={count,total,importMs:Math.round(imported.ms),readMedianMs:Math.round(times[6]),readP95Ms:Math.round(times[11]),exportMs:Math.round(exported.ms),exportBytes:exported.bytes.length,rssMb:Math.round(diagnostic.memory.rss/1024/1024)};
   report.stages.push(result);console.log(JSON.stringify(result));
   assert(result.importMs<report.thresholds.import10000Ms);assert(result.readP95Ms<report.thresholds.readP95Ms);assert(result.exportMs<report.thresholds.exportMs);assert(result.rssMb<report.thresholds.rssMb);
  }
  report.status='passed';
 }catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error(e.message);}
 finally{await writeFile(path.join(root,'docs/tests-charge.json'),JSON.stringify(report,null,2));const done=new Promise(r=>child.once('exit',r));child.kill();await done;await rm(tmp,{recursive:true,force:true});}
})();
