// SPEED: the app opens from the phone's copy at once (no waiting for the internet);
// a fresh copy is downloaded in the background for next time. Attendance data always comes live from the sheet.
const CACHE='couplo-att-v32';
const SHELL=['./','index.html','app.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/logo.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // never cache the sheet API
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true}).then(hit=>{
    const net=fetch(e.request).then(r=>{if(r&&r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
    if(hit){e.waitUntil(net);return hit}
    return net;
  })));
});
