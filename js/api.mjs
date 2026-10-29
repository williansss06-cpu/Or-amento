import {config} from './config.mjs';
let session=null;
export function signedIn(){return Boolean(session)}
async function request(path,body,token){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try {
  const res=await fetch(config.url+path,{method:'POST',headers:{'Content-Type':'application/json',apikey:config.publishableKey,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:controller.signal});
  const data=await res.json();
  if(!res.ok){
   if(res.status===401) session=null;
   const error=new Error(data.message||data.msg||data.error_description||'Não foi possível concluir a solicitação.');
   error.status=res.status;error.code=data.code;throw error;
  }
  return data;
 } catch(error) {
  if(error.name==='AbortError') throw new Error('Tempo de resposta excedido. Tente novamente; o mesmo identificador evita duplicação.');
  throw error;
 } finally {clearTimeout(timer)}
}
export async function login(email,password){session=await request('/auth/v1/token?grant_type=password',{email,password});session.expires=Date.now()+session.expires_in*1000;}
export async function logout(){const current=session;session=null;if(current) await request('/auth/v1/logout',{},current.access_token);}
export async function rpc(name,body={}){
 if(!session) throw new Error('Entre com sua conta administrativa.');
 if(!config.databaseReady) throw new Error('Integração preparada, aguardando homologação do banco.');
 if(session.expires<Date.now()+30000){session=await request('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});session.expires=Date.now()+session.expires_in*1000;}
 return request('/rest/v1/rpc/'+name,body,session.access_token);
}
