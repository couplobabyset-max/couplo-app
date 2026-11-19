// Always try the newest app first, so a new version shows on the first open (no refresh needed).
// If the internet is slow (over 4 seconds) or off, the phone's saved copy opens instead.
// Attendance data always comes live from the sheet.
const CACHE='couplo-att-v38';
const SHELL=['./','index.html','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // never cache the sheet API
  e.respondWith(caches.open(CACHE).then(c=>{
    const net=fetch(e.request,{cache:'no-cache'}).then(r=>{if(r&&r.ok)c.put(e.request,r.clone());return r});
    const slow=new Promise(res=>setTimeout(res,4000)).then(()=>c.match(e.request,{ignoreSearch:true}));
    return Promise.race([net,slow.then(hit=>hit||net)]).then(r=>r||net).catch(()=>c.match(e.request,{ignoreSearch:true}).then(hit=>hit||Response.error()));
  }));
});
