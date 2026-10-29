import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const src=stripTypeScriptTypes(await readFile(new URL('../supabase/functions/global-quote-approval/index.ts',import.meta.url),'utf8'));
async function worker(env={},sendStatus=200){
 let handler;const calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,body:JSON.parse(options.body||'{}'),headers:options.headers});
  const data=url.includes('global_accept_approval')?{quote_id:'quote-1',approved_at:'2026-10-29T20:00:00Z'}:
  url.includes('global_claim_email')?{id:'job-1',claim_id:'lease-1',recipient:'globalacessoriosemgeral@gmail.com',snapshot:{quote_number:1,customer_name:'Cliente',items:[],shipping_cents:0,discount_cents:0,total_cents:100,notes:'Condições'},snapshot_sha256:'hash',approver_name:'Cliente',approver_email:'cliente@example.com',approved_at:'2026-10-29T20:00:00Z'}:
  url.includes('api.resend.com')?{id:'email-1'}:null;
  return new Response(JSON.stringify(data),{status:url.includes('api.resend.com')?sendStatus:200});
 };
 vm.runInNewContext(src,{Deno:{env:{get:k=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'server-key',...env}[k])},serve:fn=>handler=fn},fetch,Response,AbortSignal,Intl,JSON,Number,Boolean,Error});
 return {calls,call:async body=>{const response=await handler(new Request('https://test/functions/v1/global-quote-approval',{method:'POST',body:JSON.stringify(body)}));return {status:response.status,data:await response.json()}}};
}
test('sem provedor: aceite preservado e nenhuma tentativa de envio anunciada',async()=>{
 const w=await worker();const r=await w.call({action:'approve',token:'capability',accepted_terms:true});
 assert.equal(r.data.email_status,'pending_configuration');assert.equal(w.calls.length,1);
 assert.equal((await w.call({action:'health'})).data.email_configured,false);
});
test('envio automatico: destinatario fixo, idempotencia e confirmação posterior',async()=>{
 const w=await worker({GLOBAL_RESEND_API_KEY:'provider-secret',GLOBAL_EMAIL_FROM:'Global <vendas@example.com>'});
 const r=await w.call({action:'approve',token:'capability',accepted_terms:true});assert.equal(r.data.email_status,'sent');
 const mail=w.calls.find(x=>x.url==='https://api.resend.com/emails');assert.deepEqual(mail.body.to,['globalacessoriosemgeral@gmail.com']);assert.equal(mail.headers['Idempotency-Key'],'global-approval-job-1');
 assert.equal(w.calls.at(-1).body.provider_id,'email-1');assert.equal(JSON.stringify(r).includes('provider-secret'),false);
});
test('falha de e-mail: registra falha sem apagar aceite',async()=>{
 const w=await worker({GLOBAL_RESEND_API_KEY:'key',GLOBAL_EMAIL_FROM:'Global <vendas@example.com>'},403);
 const r=await w.call({action:'approve'});assert.equal(r.data.email_status,'failed');assert.equal(r.data.quote_id,'quote-1');assert.ok(w.calls.at(-1).body.error_message);
});
test('reenvio exige autenticacao e nunca aceita destinatario arbitrario',async()=>{
 const w=await worker();const r=await w.call({action:'retry',quote_id:'quote-1',recipient:'attacker@example.com'});
 assert.equal(r.status,401);assert.equal(w.calls.length,0);
});
