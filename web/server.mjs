import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('./',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.ico':'image/x-icon','.woff2':'font/woff2'};

createServer(async(req,res)=>{
  const name=decodeURIComponent((req.url||'/').split('?')[0]).replace(/^\/+/, '')||'index.html';
  const file=normalize(join(root,name));
  if(!file.startsWith(root)){res.writeHead(403);res.end('Forbidden');return;}
  try {
    const body=await readFile(file);
    if(res.writableEnded)return;
    res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store'});
    res.end(body);
  } catch {
    if(!res.writableEnded){res.writeHead(404);res.end('Not found');}
  }
}).listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('M6 Lite Control Web: http://localhost:4173'));
