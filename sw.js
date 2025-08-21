const CACHE = 'neet-final-v1';
const ASSETS = [
  '/index.html','/style.css','/app.js','/manifest.json','/icons/icon-192.svg','/icons/icon-512.svg'
];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(CACHE).then(c=> c.addAll(ASSETS)).then(()=> self.skipWaiting())); });
self.addEventListener('activate', e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e=>{
  e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request).then(res=>{ const resClone = res.clone(); caches.open(CACHE).then(c=> c.put(e.request, resClone)); return res; }).catch(()=> caches.match('/index.html'))));
});