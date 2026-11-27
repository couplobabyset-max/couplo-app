// Couplo Dispatch: newest copy first; the saved copy opens when the internet is off or slow (4 s). The sheet API is never cached.
const CACHE='couplo-dispatch-v17';
const SHELL=['./','index.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','../icons/logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('couplo-dispatch')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url);
  if(req.method!=='GET')return;
  const lib=/cdnjs\.cloudflare\.com|unpkg\.com/.test(u.host);
  if(u.origin!==location.origin&&!lib)return;
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const net=fetch(req,{cache:'no-cache'}).then(r=>{if(r&&(r.ok||r.type==='opaque'))c.put(req,r.clone()).catch(()=>{});return r});
    const cached=()=>c.match(req,{ignoreSearch:true});
    try{const first=await Promise.race([net,new Promise(res=>setTimeout(()=>res(null),4000))]);if(first)return first;return (await cached())||(await net)}
    catch(err){return (await cached())||Response.error()}
  })());
});
