import {calculate,quoteNumber,normalizePhone} from './quote-core.mjs';
import {login,logout,rpc,signedIn} from './api.mjs';
import {config} from './config.mjs';
const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
function newRequestId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')}
let requestId=newRequestId(),lastPayload='',saved=false,busy=false,offset=0;
function status(message){$('status').textContent=message}
function formItems(){return [...document.querySelectorAll('.item')].map(el=>({description:el.querySelector('.desc').value,quantity:el.querySelector('.qty').value,price:el.querySelector('.price').value}));}
function totals(){return calculate(formItems(),$('frete').value,$('desconto').value)}
function updateButtons(){
 $('salvar').disabled=busy||saved||!signedIn()||!config.databaseReady;
 $('historico').disabled=busy||!signedIn()||!config.databaseReady;
 $('entrar').disabled=busy;$('novo').disabled=busy;$('sair').disabled=busy;
 document.querySelectorAll('#history-list button').forEach(el=>el.disabled=busy);
 document.querySelectorAll('main input:not(#numero),main textarea,#add,.remove').forEach(el=>el.disabled=busy);
}
function dirty(){if(saved||lastPayload){requestId=newRequestId();lastPayload='';saved=false;$('numero').value='RASCUNHO (sem número)';status('Alterações pendentes. Ao salvar, será criada uma nova proposta.')}recalc();updateButtons()}
function addItem(d={}){
 const el=document.createElement('div');el.className='item';
 el.innerHTML='<div class="description"><label>Produto / descrição</label><input class="desc" maxlength="500"></div><div><label>Quantidade</label><input class="qty" type="number" min="1" max="1000000" step="1"></div><div><label>Valor unit. R$</label><input class="price" type="number" min="0" step=".01"></div><div><label>Subtotal</label><input class="subtotal" readonly></div><button type="button" class="remove secondary" aria-label="Remover produto">×</button>';
 el.querySelector('.desc').value=d.description||'';el.querySelector('.qty').value=d.quantity??1;el.querySelector('.price').value=d.price??0;
 el.querySelector('.remove').onclick=()=>{el.remove();dirty()};el.querySelectorAll('input:not(.subtotal)').forEach(i=>i.addEventListener('input',dirty));$('itens').append(el);recalc();
}
function recalc(){
 document.querySelectorAll('.item').forEach(el=>{try{el.querySelector('.subtotal').value=money(calculate([{description:el.querySelector('.desc').value||'Produto',quantity:el.querySelector('.qty').value,price:el.querySelector('.price').value}],0,0).total_cents)}catch{el.querySelector('.subtotal').value='Verifique valores'}});
 try{$('total').textContent=money(totals().total_cents)}catch(error){$('total').textContent=error.message}
}
function payload(){
 const calculated=totals();
 if(!$('cliente').value.trim()) throw new Error('Informe a empresa / cliente.');
 if($('email').value&&!$('email').checkValidity()) throw new Error('Verifique o e-mail do cliente.');
 return {request_id:requestId,customer_name:$('cliente').value.trim(),customer_tax_id:$('cnpj').value.trim(),customer_email:$('email').value.trim(),customer_phone:normalizePhone($('telefone').value),contact_name:$('contato').value.trim(),notes:$('observacoes').value.trim(),items:calculated.items.map(({line_total_cents,...item})=>item),shipping_cents:calculated.shipping_cents,discount_cents:calculated.discount_cents};
}
function summary(){payload();return 'Proposta '+$('numero').value+'\nCliente: '+$('cliente').value+'\nValor: '+money(totals().total_cents)+'\nContato: '+$('contato').value+'\n\nPDF disponível mediante anexo.'}
$('add').onclick=()=>{addItem();dirty()};
['cliente','cnpj','contato','email','telefone','observacoes','frete','desconto'].forEach(id=>$(id).addEventListener('input',dirty));
$('pdf').onclick=()=>{try{payload();document.title='Global_'+(saved?$('numero').value:'Rascunho');window.print()}catch(e){status(e.message)}};
$('whatsapp').onclick=()=>{try{window.open('https://wa.me/'+normalizePhone($('telefone').value)+'?text='+encodeURIComponent('Olá! Segue resumo da proposta comercial Global:\n'+summary()),'_blank','noopener,noreferrer')}catch(e){status(e.message)}};
$('mail').onclick=()=>{try{window.location.href='mailto:'+encodeURIComponent($('email').value.trim())+'?subject='+encodeURIComponent('Proposta comercial Global - '+$('numero').value)+'&body='+encodeURIComponent('Olá,\n\n'+summary()+'\n\nAtenciosamente,\nGlobal Acessórios e Soluções Logísticas')}catch(e){status(e.message)}};
$('login-form').onsubmit=async e=>{
 e.preventDefault();busy=true;updateButtons();
 try{await login($('login-email').value.trim(),$('login-password').value);$('usuario').textContent=$('login-email').value.trim();$('login-form').hidden=true;$('sessao').hidden=false;$('auth-status').textContent=config.databaseReady?'Sessão iniciada.':'Sessão iniciada. Banco aguardando homologação.'}catch(error){$('auth-status').textContent=error.message}finally{$('login-password').value='';busy=false;updateButtons()}
};
$('sair').onclick=async()=>{try{await logout()}catch{$('auth-status').textContent='Sessão local encerrada. Não foi possível confirmar a saída no servidor.'}finally{reset();$('history-list').replaceChildren();$('login-form').hidden=false;$('sessao').hidden=true;$('usuario').textContent='';$('history-status').textContent='Entre para consultar seus orçamentos.';updateButtons()}};
$('salvar').onclick=async()=>{
 try{
  const p=payload(),serialized=JSON.stringify(p);
  if(lastPayload&&lastPayload!==serialized) throw new Error('Dados alterados. Revise o orçamento.');
  lastPayload=serialized;busy=true;updateButtons();status('Salvando orçamento…');
  const result=await rpc('global_save_quote',{payload:p});saved=true;$('numero').value=quoteNumber(result.quote_number);$('total').textContent=money(result.total_cents);
  status('Orçamento '+$('numero').value+' salvo. Alterações criarão uma nova proposta.');
 }catch(error){status(error.message+' Nenhuma confirmação de gravação recebida.')}finally{busy=false;updateButtons()}
};
async function history(){
 busy=true;updateButtons();$('anterior').disabled=true;$('proxima').disabled=true;
 try{
  const rows=await rpc('global_list_quotes',{page_offset:offset});$('history-list').replaceChildren();
  $('history-status').textContent=rows.length?'Exibindo '+(offset+1)+' a '+(offset+rows.length):'Nenhum orçamento nesta página.';
  for(const row of rows){const button=document.createElement('button');button.className='secondary';button.style.margin='8px 8px 0 0';button.textContent=quoteNumber(row.quote_number)+' · '+row.customer_name+' · '+money(row.total_cents)+' · '+row.status;button.onclick=()=>load(row.id);$('history-list').append(button)}
  $('anterior').disabled=offset===0;$('proxima').disabled=rows.length<50;
 }catch(error){$('history-status').textContent=error.message}finally{busy=false;updateButtons()}
}
async function load(id){
 if(!confirm('Abrir esta proposta e substituir os dados atuais do formulário?')) return;
 busy=true;updateButtons();
 try{
  const q=await rpc('global_get_quote',{quote_id:id});
  for(const [input,key] of Object.entries({cliente:'customer_name',cnpj:'customer_tax_id',contato:'contact_name',email:'customer_email',telefone:'customer_phone',observacoes:'notes'})) $(input).value=q[key]||'';
  $('frete').value=(q.shipping_cents/100).toFixed(2);$('desconto').value=(q.discount_cents/100).toFixed(2);$('itens').replaceChildren();
  for(const item of q.items) addItem({description:item.description,quantity:item.quantity,price:(item.unit_price_cents/100).toFixed(2)});
  requestId=q.id;saved=true;lastPayload='';$('numero').value=quoteNumber(q.quote_number);recalc();status('Proposta salva carregada. Alterações gerarão uma nova proposta.');
 }catch(error){status(error.message)}finally{busy=false;updateButtons()}
}
function reset(){requestId=newRequestId();lastPayload='';saved=false;for(const id of ['cliente','cnpj','contato','email','telefone','observacoes']) $(id).value='';$('frete').value=0;$('desconto').value=0;$('numero').value='RASCUNHO (sem número)';$('itens').replaceChildren();addItem({description:'Cinta de amarração'});status('Rascunho local. Nenhum dado enviado.');updateButtons()}
$('novo').onclick=()=>{if(confirm('Limpar o formulário para iniciar outro orçamento?'))reset()};
$('historico').onclick=()=>{offset=0;history()};$('anterior').onclick=()=>{offset=Math.max(0,offset-50);history()};$('proxima').onclick=()=>{offset+=50;history()};
window.addEventListener('beforeunload',e=>{if(!saved&&($('cliente').value||lastPayload)){e.preventDefault();e.returnValue=''}});
reset();
