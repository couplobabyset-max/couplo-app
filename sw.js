// Newest app first, so an update shows on the first open. If the internet is off or very slow (4 s),
// the phone's saved copy opens instead. The sheet API is never cached.
const CACHE='couplo-att-v71';
const SHELL=['./','index.html','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url);
  if(req.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const net=fetch(req.url,{cache:'no-cache',credentials:'same-origin'}).then(r=>{if(r&&r.ok)c.put(req,r.clone()).catch(()=>{});return r});
    const cached=()=>c.match(req,{ignoreSearch:true});
    try{
      const first=await Promise.race([net,new Promise(res=>setTimeout(()=>res(null),4000))]);
      if(first)return first;
      return (await cached())||(await net);
    }catch(err){
      return (await cached())||Response.error();
    }
  })());
});
