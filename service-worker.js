// Simple service worker caching core assets for offline use
const CACHE = 'omnipom-cache-v1';
const ASSETS = [
  '.','index.html','style.css','app.js','idb.js','manifest.json','icons/icon.svg'
];
self.addEventListener('install', (e)=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', (e)=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e)=>{ const req = e.request; const url = new URL(req.url); if (req.method !== 'GET') return; e.respondWith(caches.match(req).then(r=> r || fetch(req).then(res=>{ return caches.open(CACHE).then(c=>{ c.put(req, res.clone()); return res; }); }).catch(()=> caches.match('index.html')))); });