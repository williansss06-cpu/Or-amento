import {login,logout,rpc,signedIn,publicRpc,approvalService} from './api.mjs?v=original1';
import {calculate,quoteNumber,normalizePhone} from './quote-core.mjs';
const el=id=>document.getElementById(id),isPublic=location.pathname.endsWith('/aprovar.html');
function uuid(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-')}
let sourceLeadId=null;
let currentId=uuid(),savedSignature=null,savedNumber=null,loading=false,busy=false,approval=null;
const signature=()=>JSON.stringify({...state,numeroOrcamento:undefined});
const message=s=>{el('cloud-status').textContent=s};
const emailText={sent:'Notificação enviada ao provedor.',pending:'Notificação aguardando envio.',failed:'Envio não confirmado; aceite preservado.',sending:'Envio em andamento.',pending_configuration:'E-mail pendente de configuração do provedor.',already_sent_or_processing:'Notificação já enviada ou em processamento.'};
function buttons(){
 document.querySelectorAll('#fields input,#fields textarea,#fields button,.toolbar button,#cloud-history-list button,#cloud-login button').forEach(x=>x.disabled=busy);
 el('cloud-save').disabled=busy||Boolean(savedSignature);el('cloud-save').textContent=!signedIn()?'Entrar para salvar orçamento':'Salvar orçamento no sistema';
 if(el('shop-leads'))el('shop-leads').disabled=busy||!signedIn();
 el('cloud-history').disabled=busy||!signedIn();el('cloud-logout').hidden=!signedIn();
 el('cloud-issue').disabled=busy||!savedSignature||!signedIn()||Boolean(approval?.approved_at);
 el('cloud-check').disabled=busy||!savedSignature||!signedIn();
 el('cloud-retry').disabled=busy||!approval?.approved_at||approval?.email_status==='sent';
}
function invalidate(){currentId=uuid();savedSignature=null;savedNumber=null;approval=null;state.numeroOrcamento='RASCUNHO (sem número)';el('cloud-link').textContent='';el('cloud-link').removeAttribute('href');el('cloud-print-link').hidden=true;el('cloud-print-anchor').removeAttribute('href');el('cloud-approval-status').textContent='Salve as alterações para gerar o link desta nova proposta.';buttons()}
const originalUpdate=window.update;
window.update=function(){if(!loading&&savedSignature&&(signature()!==savedSignature||state.numeroOrcamento!==savedNumber))invalidate();originalUpdate();buttons()};
document.addEventListener('global-new-quote',()=>{sourceLeadId=null;invalidate();window.update();message('Novo rascunho. A numeração oficial será gerada ao salvar.')});
function payload(){
 const totals=calculate(state.products.map(p=>({description:[p.nome,p.tamanho,p.descricao].filter(Boolean).join(' · '),quantity:p.qtd,price:p.preco})),state.custoFrete,state.desc);
 if(!String(state.cliente||'').trim())throw new Error('Informe a empresa cliente.');
 return {request_id:currentId,customer_name:String(state.cliente).trim(),customer_tax_id:String(state.cnpjCliente||''),customer_email:String(state.emailCliente||''),customer_phone:normalizePhone(state.telefoneCliente||''),contact_name:String(state.contato||''),notes:String(state.condicoes||''),items:totals.items.map(({line_total_cents,...p})=>p),shipping_cents:totals.shipping_cents,discount_cents:totals.discount_cents,presentation:structuredClone(state)};
}
async function brandImages(){
 const res=await fetch('./assets/proposta-original.txt');if(!res.ok)throw new Error('Não foi possível carregar as imagens da proposta.');
 const doc=new DOMParser().parseFromString(await res.text(),'text/html');const images=[...doc.querySelectorAll('img')];
 document.querySelectorAll('[data-original-image]').forEach(img=>{img.src=images[Number(img.dataset.originalImage)].src});
 await Promise.all([...document.querySelectorAll('[data-original-image]')].map(img=>img.decode()));
}
function restore(q){
 loading=true;
 try{
  const p=q.presentation&&typeof q.presentation==='object'?q.presentation:null;
  config.forEach(([id,label,type,def])=>{state[id]=p?.[id]??def;el(id).value=state[id]});
  if(!p) for(const id of ['pallets','precoKgStretch','converter','movimentos','aplicacoesStretch']){state[id]=0;el(id).value=0}
  state.cliente=q.customer_name;state.cnpjCliente=q.customer_tax_id||'';state.emailCliente=q.customer_email||'';state.telefoneCliente=q.customer_phone||'';state.contato=q.contact_name||'';state.condicoes=q.notes||'';state.custoFrete=q.shipping_cents/100;state.desc=q.discount_cents/100;
  state.products=q.items.map((item,i)=>{
   const original=p?.products?.[i];
   const description=original?[original.nome,original.tamanho,original.descricao].filter(Boolean).join(' · '):'';
   return {nome:description===item.description?original.nome:item.description,tamanho:description===item.description?original.tamanho:'',descricao:description===item.description?original.descricao:'',qtd:item.quantity,preco:item.unit_price_cents/100};
  });
  state.numeroOrcamento=quoteNumber(q.quote_number);
  config.forEach(([id])=>{el(id).value=state[id]});renderProductEditor();originalUpdate();
  sourceLeadId=q.source_lead_id||null;currentId=q.id;savedNumber=state.numeroOrcamento;savedSignature=signature();
  el('cloud-link').textContent='';el('cloud-link').removeAttribute('href');el('cloud-print-link').hidden=true;el('cloud-print-anchor').removeAttribute('href');
 }finally{loading=false;buttons()}
}
async function checkApproval(){
 approval=await rpc('global_approval_status',{quote_id:currentId});
 el('cloud-approval-status').textContent=approval.approved_at?'Aprovado por '+approval.approver_name+' em '+new Date(approval.approved_at).toLocaleString('pt-BR')+'. '+(emailText[approval.email_status]||''):approval.expires_at?'Aguardando aprovação. Validade do link: '+new Date(approval.expires_at).toLocaleString('pt-BR'):'Nenhum link emitido.';buttons();
}
el('cloud-login').onsubmit=async e=>{
 e.preventDefault();busy=true;buttons();
 try{message('Entrando no sistema…');await login(el('cloud-email').value.trim(),el('cloud-password').value);el('cloud-login').hidden=true;message('Sessão iniciada. O modelo original pode ser salvo no Supabase.')}catch(error){const detail=error.message==='Invalid login credentials'?'E-mail ou senha não conferem. Use a conta administrativa cadastrada no Global Shop.':error.message;message(detail);alert(detail)}finally{el('cloud-password').value='';busy=false;buttons()}
};
el('cloud-logout').onclick=async()=>{try{await logout()}catch{}finally{el('cloud-login').hidden=false;el('cloud-history-list').replaceChildren();el('shop-lead-list')?.replaceChildren();sourceLeadId=null;invalidate();window.update();message('Sessão encerrada.')}};
el('cloud-save').onclick=async()=>{
 if(!signedIn()){document.querySelector('#cloud-admin details').open=true;el('cloud-email').focus();message('Primeiro clique em Entrar e aguarde a confirmação da sessão.');alert('Primeiro clique em Entrar e aguarde a confirmação da sessão.');return}

 busy=true;buttons();
 try{const p=payload(),s=signature();message('Salvando orçamento…');const result=await rpc(sourceLeadId?'global_save_shop_quote':'global_save_quote',sourceLeadId?{payload:p,lead_id:sourceLeadId}:{payload:p});if(s!==signature()){message('A versão enviada foi salva. Há alterações posteriores no formulário; abra a proposta no histórico para conferir.');invalidate();return}savedNumber=quoteNumber(result.quote_number);currentId=result.id||currentId;state.numeroOrcamento=savedNumber;savedSignature=signature();originalUpdate();persist();message('Orçamento '+savedNumber+' salvo com produtos, condições e todas as premissas da simulação.')}catch(error){message(error.message)}finally{busy=false;buttons()}
};
el('cloud-history').onclick=async()=>{
 busy=true;buttons();
 try{const rows=await rpc('global_list_quotes',{page_offset:0});el('cloud-history-list').replaceChildren();for(const q of rows){const b=document.createElement('button');b.className='secondary';b.style.margin='8px 8px 0 0';b.textContent=quoteNumber(q.quote_number)+' · '+q.customer_name;b.onclick=async()=>{if(!confirm('Abrir esta proposta e substituir os dados atuais do editor?'))return;try{restore(await rpc('global_get_quote',{quote_id:q.id}));await checkApproval();message('Proposta carregada. Alterações criarão um novo orçamento.')}catch(error){message(error.message)}};el('cloud-history-list').append(b)}message(rows.length?'Últimos '+rows.length+' orçamentos.':'Nenhum orçamento salvo.')}catch(error){message(error.message)}finally{busy=false;buttons()}
};
el('cloud-issue').onclick=async()=>{
 if(!confirm('Gerar link válido por sete dias? Um link anterior será substituído.'))return;
 busy=true;buttons();
 try{const result=await rpc('global_issue_approval',{quote_id:currentId});const link='https://globalacessorioslogisticos.com.br/pedido?proposta=1#token='+result.token;el('cloud-print-link').hidden=false;el('cloud-print-anchor').href=link;el('cloud-link').href=link;el('cloud-link').textContent='Conferir e aprovar esta proposta: '+link;await checkApproval();const health=await approvalService({action:'health'});if(!health.email_configured)el('cloud-approval-status').textContent+=' Notificação por e-mail pendente de configuração.'}catch(error){message(error.message)}finally{busy=false;buttons()}
};
el('cloud-check').onclick=()=>checkApproval().catch(e=>message(e.message));
el('cloud-retry').onclick=async()=>{busy=true;buttons();try{const result=await approvalService({action:'retry',quote_id:currentId},true);await checkApproval();el('cloud-approval-status').textContent+=' '+(emailText[result.email_status]||'Envio pendente.')}catch(error){message(error.message)}finally{busy=false;buttons()}};
function requireShareReady(){
 if(!signedIn()||!savedSignature){document.querySelector('#cloud-admin details').open=true;const text='Entre e clique em Salvar orçamento no sistema antes de compartilhar.';message(text);alert(text);return false}
 if(!el('cloud-link').getAttribute('href')){const text='Clique em Gerar link de aprovação antes de compartilhar. O PDF deve ser gerado e anexado separadamente no WhatsApp.';message(text);el('cloud-issue').scrollIntoView({behavior:'smooth',block:'center'});alert(text);return false}
 return true;
}
function shareText(){return 'Proposta Global '+state.numeroOrcamento+'\nCliente: '+state.cliente+'\nInvestimento: '+el('total').textContent+(el('cloud-link').href?'\n'+el('cloud-link').href:'\nPDF mediante anexo.')}
el('cloud-whatsapp').onclick=()=>{if(!requireShareReady())return;try{window.open('https://wa.me/'+normalizePhone(state.telefoneCliente||'')+'?text='+encodeURIComponent(shareText()),'_blank','noopener,noreferrer')}catch(error){message(error.message)}};
el('cloud-mail').textContent='Enviar pelo Zoho Mail';el('cloud-mail').onclick=()=>{if(!requireShareReady())return;if(!currentId) return message('Salve o orçamento antes de enviar.');window.top.location.href='https://globalacessorioslogisticos.com.br/admin?tab=quoteTracking&quoteId='+encodeURIComponent(currentId)};
el('cloud-accept').onsubmit=async e=>{
 e.preventDefault();el('cloud-accept-button').disabled=true;
 try{const result=await approvalService({action:'approve',token:new URLSearchParams(location.hash.slice(1)).get('token'),approver_name:el('approvalName').value.trim(),approver_email:el('approvalEmail').value.trim(),approver_role:el('approvalRole').value.trim(),customer_reference:el('approvalRef').value.trim(),accepted_terms:el('approvalConsent').checked});el('cloud-accept').hidden=true;el('approvalStatus').textContent='Aprovação registrada em '+new Date(result.approved_at).toLocaleString('pt-BR')+'. '+(emailText[result.email_status]||'Notificação pendente.')}catch(error){el('approvalStatus').textContent=error.message}finally{el('cloud-accept-button').disabled=false}
};

if(!isPublic){
 const button=document.createElement('button');button.id='shop-leads';button.className='secondary';button.textContent='Solicitações da loja';
 el('cloud-history').after(button);
 const list=document.createElement('div');list.id='shop-lead-list';el('cloud-history-list').after(list);
 button.onclick=async()=>{
  busy=true;buttons();
  try{
   const rows=await rpc('global_shop_leads');list.replaceChildren();
   for(const lead of rows){
    const row=document.createElement('p'),b=document.createElement('button');b.className='secondary';
    b.textContent=lead.company_name+' · '+lead.stage+(lead.quote_id?' · Abrir orçamento':' · Revisar solicitação');
    b.onclick=async()=>{
     if(!confirm('Carregar esta solicitação e substituir o formulário atual?'))return;
     busy=true;buttons();
     try{
      if(lead.quote_id){restore(await rpc('global_get_quote',{quote_id:lead.quote_id}));await checkApproval();return}
      if(!lead.product_name||!Number.isInteger(lead.quantity)||lead.quantity<1||lead.quantity>1000000)throw new Error('Solicitação sem produto ou quantidade válida. Confira o cadastro da loja.');
      loading=true;sourceLeadId=lead.id;invalidate();
      config.forEach(([id,label,type,def])=>{state[id]=def});
      Object.assign(state,{cliente:lead.company_name,cnpjCliente:lead.tax_id||'',contato:lead.contact_name||'',emailCliente:lead.email||'',telefoneCliente:lead.phone||'',pallets:0,precoKgStretch:0,converter:0,movimentos:0,aplicacoesStretch:0,condicoes:'Solicitação recebida pela loja. Quantidade e preço sujeitos à revisão comercial. Premissas de economia devem ser preenchidas e conferidas antes do envio.'});
      const now=Date.now(),promo=lead.promotional_price_cents!=null&&(!lead.promotion_starts_at||Date.parse(lead.promotion_starts_at)<=now)&&(!lead.promotion_ends_at||Date.parse(lead.promotion_ends_at)>=now);
      state.products=[{nome:lead.product_name,tamanho:'',descricao:lead.short_description||'',qtd:lead.quantity,preco:(promo?lead.promotional_price_cents:lead.base_price_cents)/100}];
      config.forEach(([id])=>{el(id).value=state[id]});renderProductEditor();originalUpdate();persist();
      message('Solicitação importada. Revise produto, quantidade, preço e premissas; depois salve para gerar o número GL.');
     }catch(error){message(error.message)}finally{loading=false;busy=false;buttons()}
    };row.append(b);list.append(row);
   }
   message(rows.length?'Solicitações recentes da calculadora da loja.':'Nenhuma solicitação da calculadora encontrada.');
  }catch(error){message(error.message)}finally{busy=false;buttons()}
 };
}

if(isPublic){
 document.querySelectorAll('.no-print').forEach(x=>x.hidden=true);
 try{const view=await publicRpc('global_view_approval',{token:new URLSearchParams(location.hash.slice(1)).get('token')});restore(view.quote);el('cloud-terms').textContent=view.terms;el('cloud-accept').hidden=Boolean(view.approved_at);el('approvalStatus').textContent=view.approved_at?'Proposta aprovada em '+new Date(view.approved_at).toLocaleString('pt-BR'):'';await brandImages();document.documentElement.classList.remove('public-loading')}catch(error){document.querySelector('.proposal').hidden=true;document.documentElement.classList.remove('public-loading');const p=document.createElement('p');p.setAttribute('role','status');p.textContent=error.message;document.querySelector('.app').append(p)}
}else{buttons();brandImages().catch(error=>message(error.message))}
