const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
http.createServer((req,res)=>{
  const route = req.url.split('?')[0];
  const allowed = {'/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/game.js': 'game.js', '/world.js': 'world.js'};
  if (!allowed[route]) { res.writeHead(404); return res.end('Not found'); }
  const file = path.join(root, allowed[route]);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file,(err,data)=>{ if(err){res.writeHead(404);return res.end('Not found');} res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)] || 'application/octet-stream');res.end(data);});
}).listen(process.env.PORT || 3000, '0.0.0.0',()=>console.log('Scriptoria listening on port ' + (process.env.PORT || 3000)));
