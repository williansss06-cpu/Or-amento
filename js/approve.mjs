import {publicRpc,approvalService} from './api.mjs?v=approval1';
import {quoteNumber} from './quote-core.mjs';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const token=new URLSearchParams(location.hash.slice(1)).get('token');
async function load(){
 try{
  const view=await publicRpc('global_view_approval',{token});const q=view.quote;
  $('public-number').textContent='Proposta '+quoteNumber(q.quote_number);document.title='Global_'+quoteNumber(q.quote_number);
  $('public-customer').textContent='Cliente: '+q.customer_name+(q.customer_tax_id?' · CNPJ: '+q.customer_tax_id:'');
  $('public-expiry').textContent='Validade do link: '+new Date(view.expires_at).toLocaleString('pt-BR');
  $('public-items').replaceChildren();
  for(const item of q.items){const tr=document.createElement('tr');for(const value of [item.description,item.quantity,money(item.unit_price_cents),money(item.line_total_cents)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}$('public-items').append(tr)}
  $('public-shipping').textContent='Frete: '+money(q.shipping_cents);$('public-discount').textContent='Desconto: '+money(q.discount_cents);$('public-total').textContent='Total: '+money(q.total_cents);$('public-notes').textContent=q.notes||'Sem observações adicionais.';
  $('public-terms').textContent=view.terms;$('proposal').hidden=false;$('acceptance').hidden=Boolean(view.approved_at);
  $('public-status').textContent=view.approved_at?'Esta proposta já foi aprovada em '+new Date(view.approved_at).toLocaleString('pt-BR')+'.':'Confira todos os produtos, valores e condições antes de confirmar.';
 }catch(error){$('public-status').textContent=error.message;$('acceptance').hidden=true}
}
$('public-print').onclick=()=>window.print();
$('accept-form').onsubmit=async e=>{
 e.preventDefault();$('accept-button').disabled=true;
 try{
  const result=await approvalService({action:'approve',token,approver_name:$('approver-name').value.trim(),approver_email:$('approver-email').value.trim(),accepted_terms:$('accept-terms').checked});
  $('acceptance').hidden=true;
  $('public-status').textContent='Aprovação registrada em '+new Date(result.approved_at).toLocaleString('pt-BR')+'. '+(result.email_status==='sent'?'A notificação foi enviada ao provedor de e-mail.':'A notificação está pendente de envio; sua aprovação foi preservada.');
 }catch(error){$('public-status').textContent=error.message+' Tente novamente. Caso o aceite já tenha sido registrado, ele será preservado sem duplicação.'}finally{$('accept-button').disabled=false}
};
load();
