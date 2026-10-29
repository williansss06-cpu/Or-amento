import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const db=new PGlite({extensions:{pgcrypto}});
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',inactive='00000000-0000-4000-8000-000000000003',customer='00000000-0000-4000-8000-000000000004';
const payload=(id='10000000-0000-4000-8000-000000000001')=>({request_id:id,customer_name:'Cliente teste',items:[{description:'Cinta',quantity:3,unit_price_cents:10}],shipping_cents:20,discount_cents:1});
async function as(role,uid,sql,params=[]){
 await db.exec(`set role ${role}`);
 try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);return await db.query(sql,params)}finally{await db.exec('reset role')}
}
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema extensions;create extension pgcrypto with schema extensions;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create table public.profiles(id uuid primary key,active boolean,role text);`);
for(const [id,active,role] of [[owner,true,'owner'],[other,true,'admin'],[inactive,false,'admin'],[customer,true,'customer']]){
 await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.profiles values($1,$2,$3)',[id,active,role]);
}
const migration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(x=>x.endsWith('_global_quotes_authenticated_persistence.sql'));
await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
test('persistencia: calcula no banco, atribui GL e reutiliza UUID sem duplicar',async()=>{
 const p=payload();p.total_cents=999999;
 const save=()=>as('authenticated',owner,'select public.global_save_quote($1) result',[p]);
 const first=(await save()).rows[0].result,second=(await save()).rows[0].result;
 assert.equal(first.total_cents,49);assert.equal(first.quote_number,1);assert.deepEqual(first,second);
 assert.equal((await db.query('select count(*)::int n from global_quotes.quotes')).rows[0].n,1);
 await assert.rejects(()=>as('authenticated',owner,'select public.global_save_quote($1)',[{...p,customer_name:'Alterado'}]),/Identificador reutilizado/);
});
test('acesso: anon, inativo, cliente e usuario sem JWT nao salvam',async()=>{
 for(const [role,uid] of [['anon',null],['authenticated',null],['authenticated',inactive],['authenticated',customer]]){
  await assert.rejects(()=>as(role,uid,'select public.global_save_quote($1)',[payload()]));
 }
});
test('isolamento: administrador nao consulta nem reutiliza proposta de outro',async()=>{
 assert.deepEqual((await as('authenticated',other,'select public.global_list_quotes() result')).rows[0].result,[]);
 await assert.rejects(()=>as('authenticated',other,'select public.global_get_quote($1)',[payload().request_id]),/nao encontrada/);
 await assert.rejects(()=>as('authenticated',other,'select public.global_save_quote($1)',[payload()]),/Acesso negado/);
});
test('tabelas privadas nao permitem consulta ou alteracao direta',async()=>{
 for(const sql of ['select * from global_quotes.quotes','delete from global_quotes.quote_items','update global_quotes.quotes set total_cents=0']) await assert.rejects(()=>as('authenticated',owner,sql),/permission denied/);
 const rows=(await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='global_quotes' and c.relkind='r'")).rows;
 assert.ok(rows.every(x=>x.relrowsecurity));
});
test('validacao e atomicidade: quantidade fracionada, desconto, cliente ausente, lista vazia',async()=>{
 const samples=[{...payload(),items:[]},{...payload(),customer_name:''},{...payload(),discount_cents:1000},{...payload(),items:[{description:'Cinta',quantity:1.5,unit_price_cents:10}]}];
 for(const [i,p] of samples.entries()) {p.request_id='20000000-0000-4000-8000-'+String(i).padStart(12,'0');await assert.rejects(()=>as('authenticated',owner,'select public.global_save_quote($1)',[p]));}
 assert.equal((await db.query('select count(*)::int n from global_quotes.quotes')).rows[0].n,1);
});
test('historico preserva itens e ordenacao; numeros diferentes para novos pedidos',async()=>{
 const result=(await as('authenticated',owner,'select public.global_get_quote($1) result',[payload().request_id])).rows[0].result;
 assert.equal(result.items[0].line_total_cents,30);assert.equal(result.request_payload,undefined);
 const created=(await as('authenticated',owner,'select public.global_save_quote($1) result',[payload('30000000-0000-4000-8000-000000000001')])).rows[0].result;
 assert.notEqual(created.quote_number,result.quote_number);
 const list=(await as('authenticated',owner,'select public.global_list_quotes() result')).rows[0].result;
 assert.equal(list.length,2);assert.equal(list[0].id,created.id);
});
let approvalToken;
test('aprovação: migration, link seguro e snapshot sem dados internos',async()=>{
 const files=await readdir(new URL('../supabase/migrations/',import.meta.url));
 const file=files.find(x=>x.endsWith('_global_quote_approval_and_email_outbox.sql'));
 await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await assert.rejects(()=>as('anon',null,'select public.global_issue_approval($1)',[payload().request_id]));
 await assert.rejects(()=>as('authenticated',other,'select public.global_issue_approval($1)',[payload().request_id]));
 const issued=(await as('authenticated',owner,'select public.global_issue_approval($1) result',[payload().request_id])).rows[0].result;
 approvalToken=issued.token;assert.match(approvalToken,/^[a-f0-9]{64}$/);
 const view=(await as('anon',null,'select public.global_view_approval($1) result',[approvalToken])).rows[0].result;
 assert.equal(view.quote.total_cents,49);assert.equal(view.quote.request_payload,undefined);
 assert.equal((await db.query('select token_hash from global_quotes.approval_links')).rows[0].token_hash===approvalToken,false);
 for(const token of ['',null,'a'.repeat(64)]) await assert.rejects(()=>as('anon',null,'select public.global_view_approval($1)',[token]));
});
test('aprovação: reemissão revoga anterior e aceite exige nome/email/consentimento',async()=>{
 const old=approvalToken;
 approvalToken=(await as('authenticated',owner,'select public.global_issue_approval($1) result',[payload().request_id])).rows[0].result.token;
 await assert.rejects(()=>as('anon',null,'select public.global_view_approval($1)',[old]));
 for(const [name,email,accepted] of [['Cliente','teste@example.com',false],['','teste@example.com',true],['Cliente','invalido',true]]) await assert.rejects(()=>as('anon',null,'select public.global_accept_approval($1,$2,$3,$4)',[approvalToken,name,email,accepted]));
});
test('aprovação: aceite e fila atômicos, repetição não duplica nem altera aprovador',async()=>{
 const accept=(name)=>as('anon',null,'select public.global_accept_approval($1,$2,$3,true) result',[approvalToken,name,'teste@example.com']);
 const first=(await accept('Cliente teste')).rows[0].result;assert.equal(first.already_approved,false);
 const again=(await accept('Outra pessoa')).rows[0].result;assert.equal(again.already_approved,true);
 assert.equal((await db.query('select count(*)::int n from global_quotes.email_outbox')).rows[0].n,1);
 const state=(await as('authenticated',owner,'select public.global_approval_status($1) result',[payload().request_id])).rows[0].result;
 assert.equal(state.approver_name,'Cliente teste');assert.equal(state.email_status,'pending');
 await assert.rejects(()=>as('authenticated',owner,'select public.global_issue_approval($1)',[payload().request_id]));
});
test('aprovação: link expirado bloqueia visualização e aceite',async()=>{
 const id='30000000-0000-4000-8000-000000000001';
 const issued=(await as('authenticated',owner,'select public.global_issue_approval($1) result',[id])).rows[0].result;
 await db.query("update global_quotes.approval_links set expires_at=now()-interval '1 second' where quote_id=$1",[id]);
 await assert.rejects(()=>as('anon',null,'select public.global_view_approval($1)',[issued.token]));
 await assert.rejects(()=>as('anon',null,'select public.global_accept_approval($1,$2,$3,true)',[issued.token,'Cliente','teste@example.com']));
 assert.equal((await db.query('select count(*)::int n from global_quotes.email_outbox')).rows[0].n,1);
});
test('e-mail: worker exclusivo, lease impede disputa e envio tem confirmação separada',async()=>{
 await assert.rejects(()=>as('anon',null,'select public.global_claim_email($1)',[payload().request_id]));
 await assert.rejects(()=>as('authenticated',owner,'select public.global_claim_email($1)',[payload().request_id]));
 const job=(await as('service_role',null,'select public.global_claim_email($1) result',[payload().request_id])).rows[0].result;
 assert.equal(job.recipient,'globalacessoriosemgeral@gmail.com');
 assert.equal((await as('service_role',null,'select public.global_claim_email($1) result',[payload().request_id])).rows[0].result,null);
 await as('service_role',null,'select public.global_finish_email($1,$2,null,$3)',[job.id,job.claim_id,'Falha de teste']);
 const retry=(await as('service_role',null,'select public.global_claim_email($1) result',[payload().request_id])).rows[0].result;
 assert.notEqual(retry.claim_id,job.claim_id);
 await as('service_role',null,'select public.global_finish_email($1,$2,$3,null)',[retry.id,retry.claim_id,'provider-test']);
 const state=(await as('authenticated',owner,'select public.global_approval_status($1) result',[payload().request_id])).rows[0].result;
 assert.equal(state.email_status,'sent');
});
test.after(()=>db.close());
