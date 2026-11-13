/* Optional offline site cache for GitHub Pages (after first successful online visit). */
const CACHE = 'pcic-georef-viewer-v1';
const SITE_FILES = ['./','./index.html','./style.css','./app.js','./data/farms.js','./favicon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SITE_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET' || new URL(event.request.url).origin!==location.origin) return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
