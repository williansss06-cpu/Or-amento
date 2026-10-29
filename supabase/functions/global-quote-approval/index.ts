// Public approval uses a 256-bit capability token; retries require Supabase Auth
// plus ownership checked by the user's RPC. Provider secrets never leave this runtime.
const base=Deno.env.get('SUPABASE_URL')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const origin='https://williansss06-cpu.github.io';
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function rpc(name:string,args:unknown,key=anon,token=key){
 const res=await fetch(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
 const data=await res.json();if(!res.ok) throw new Error(data.message||'Operação indisponível.');return data;
}
async function notify(quoteId:string){
 const key=Deno.env.get('GLOBAL_RESEND_API_KEY'),from=Deno.env.get('GLOBAL_EMAIL_FROM');
 if(!key||!from) return {email_status:'pending_configuration'};
 const job=await rpc('global_claim_email',{quote_id:quoteId},service);
 if(!job) return {email_status:'already_sent_or_processing'};
 try{
  const q=job.snapshot,money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100),number='GL'+String(q.quote_number).padStart(4,'0');
  const lines=q.items.map((i:{description:string;quantity:number;unit_price_cents:number;line_total_cents:number})=>`${i.description} | ${i.quantity} × ${money(i.unit_price_cents)} = ${money(i.line_total_cents)}`).join('\n');
  const text=`APROVAÇÃO DE ORÇAMENTO GLOBAL\n\nOrçamento: ${number}\nCliente: ${q.customer_name}\nCNPJ: ${q.customer_tax_id||'Não informado'}\nAprovado por: ${job.approver_name}\nE-mail: ${job.approver_email}\nCargo: ${job.approver_role||'Não informado'}\nReferência / pedido: ${job.customer_reference||'Não informado'}\nData: ${job.approved_at}\n\n${lines}\n\nFrete: ${money(q.shipping_cents)}\nDesconto: ${money(q.discount_cents)}\nTOTAL: ${money(q.total_cents)}\n\nCondições: ${q.notes||'Não informadas'}\n\nIdentificador do aceite: ${job.id}\nSHA-256 da proposta: ${job.snapshot_sha256}\n\nO aceite foi registrado no Sistema de Orçamentos Global.`;
  const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'global-approval-'+job.id},body:JSON.stringify({from,to:[job.recipient],subject:`Orçamento ${number} aprovado — Global`,text}),signal:AbortSignal.timeout(15000)});
  const result=await res.json();if(!res.ok||!result.id) throw new Error('Provedor recusou o envio. Verifique remetente e credencial.');
  await rpc('global_finish_email',{job_id:job.id,lease_id:job.claim_id,provider_id:result.id,error_message:null},service);
  return {email_status:'sent'};
 }catch{
  await rpc('global_finish_email',{job_id:job.id,lease_id:job.claim_id,provider_id:null,error_message:'Envio não confirmado. Verifique a configuração do provedor e tente novamente.'},service);
  return {email_status:'failed'};
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(req.method!=='POST') return reply({error:'Método não permitido.'},405);
 try{
  if(Number(req.headers.get('content-length')||0)>20000) return reply({error:'Solicitação muito grande.'},413);
  const raw=await req.text();if(raw.length>20000) return reply({error:'Solicitação muito grande.'},413);
  const body=JSON.parse(raw);
  if(body.action==='health') return reply({email_configured:Boolean(Deno.env.get('GLOBAL_RESEND_API_KEY')&&Deno.env.get('GLOBAL_EMAIL_FROM'))});
  if(body.action==='approve'){
   const approved=await rpc('global_accept_approval_details',{token:body.token,approver_name:body.approver_name,approver_email:body.approver_email,accepted_terms:body.accepted_terms,approver_role:body.approver_role||'',customer_reference:body.customer_reference||''});
   let mail;try{mail=await notify(approved.quote_id)}catch{mail={email_status:'pending'}};
   return reply({...approved,...mail});
  }
  if(body.action==='retry'){
   const auth=req.headers.get('Authorization')||'';
   if(!auth.startsWith('Bearer ')) return reply({error:'Autenticação necessária.'},401);
   const token=auth.slice(7);
   const user=await fetch(base+'/auth/v1/user',{headers:{apikey:anon,Authorization:auth},signal:AbortSignal.timeout(10000)});
   if(!user.ok) return reply({error:'Sessão inválida.'},401);
   const status=await rpc('global_approval_status',{quote_id:body.quote_id},anon,token);
   if(!status.approved_at) return reply({error:'A proposta ainda não foi aprovada.'},400);
   return reply(await notify(body.quote_id));
  }
  return reply({error:'Operação inválida.'},400);
 }catch(error){return reply({error:error instanceof Error?error.message:'Não foi possível concluir. Tente novamente.'},400)}
});
