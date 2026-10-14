const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]);const T={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png'};
http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);
if(!f.startsWith(root)){s.writeHead(403);return s.end();}
fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);return s.end('nf');}s.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});s.end(d);});}).listen(8765,()=>console.log('up'));
