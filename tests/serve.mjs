import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../github-repository-card-open-counts.user.js',import.meta.url),'utf8');
const card=(name='sample',native=false)=>`<li class="pinned-item-list-item"><div class="pinned-item-list-item-content"><a href="/fixture/${name}">${name}</a>${native?'<p><a href="/fixture/sample/issues" aria-label="Original issues"><svg class="octicon-issue-opened"></svg> original</a></p>':''}</div></li>`;
createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/script.js'){res.setHeader('content-type','text/javascript');return res.end(script);}
 if(url.pathname==='/api'){
  const upstream=new URL(url.searchParams.get('url'));
  const mode=url.searchParams.get('mode');
  if(mode==='error'){res.writeHead(503);return res.end('{}');}
  const pulls=upstream.pathname.endsWith('/pulls');
  const data=pulls?(mode==='counts'?[{number:1}]:[]):{open_issues_count:mode==='invalid'?'bad':mode==='counts'?7:0,has_issues:true};
  if(pulls&&mode==='counts')res.setHeader('link','<https://api.github.com/repos/fixture/sample/pulls?state=open&per_page=1&page=3>; rel="last"');
  res.setHeader('content-type','application/json');return res.end(JSON.stringify(data));
 }
 res.setHeader('content-type','text/html');
 res.end(`<!doctype html><html><head><title>Isolated repository card fixture</title></head><body><h1>Repository card fixture</h1><ul id="cards">${card('sample',url.searchParams.get('case')==='error')}${url.searchParams.get('case')==='duplicates'?card():''}</ul><button id="add">Add card</button><script>
 window.__requests=[];window.__menus=[];
 window.GM_getValue=()=>'';window.GM_setValue=()=>{};window.GM_deleteValue=()=>{};
 window.GM_registerMenuCommand=(name,callback)=>__menus.push(name);
 window.GM_xmlhttpRequest=options=>{__requests.push(options.url);fetch('/api?mode='+new URLSearchParams(location.search).get('case')+'&url='+encodeURIComponent(options.url)).then(async response=>options.onload({status:response.status,responseText:await response.text(),responseHeaders:'link: '+(response.headers.get('link')||'')})).catch(()=>options.onerror());};
 if(new URLSearchParams(location.search).get('case')==='cache')sessionStorage.setItem('github-repository-card-open-counts:fixture/sample',JSON.stringify({fetchedAt:Date.now(),counts:null}));
 document.getElementById('add').onclick=()=>document.getElementById('cards').insertAdjacentHTML('beforeend',${JSON.stringify(card('dynamic'))});
 </script><script src="/script.js"></script></body></html>`);
}).listen(4188,'127.0.0.1');
