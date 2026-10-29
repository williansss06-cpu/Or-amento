import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=process.argv.slice(2),port=Number(args[args.indexOf('--port')+1]||3000),root=resolve(import.meta.dirname,'..');
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=pathname==='/'?'/index.html':pathname;
 if(!/^\/((?:index|aprovar)\.html|js\/[a-z-]+\.mjs|assets\/proposta-original\.txt)$/.test(file)){res.writeHead(404);return res.end('Not found')}
 try{const body=await readFile(root+file);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(body)}catch{res.writeHead(404);res.end('Not found')}
}).listen(port,'0.0.0.0');
