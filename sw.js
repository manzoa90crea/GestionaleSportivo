/*
 * sw.js — Service worker: conserva i file dell'app per aprirla anche senza rete.
 *
 * Ad ogni nuova versione si cambia VERSIONE: il telefono scarica i file nuovi
 * e l'app mostra "Nuova versione disponibile". I dati (IndexedDB) non passano mai da qui.
 */
const VERSIONE = 'gestionale-v1.0.0';
const FILE = ['./', 'index.html', 'app.js', 'db.js', 'app.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE))));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== VERSIONE).map(x => caches.delete(x)))).then(() => self.clients.claim())
));

self.addEventListener('message', e => { if (e.data === 'aggiorna') self.skipWaiting(); });

// Prima la copia salvata, poi la rete; senza rete le pagine ricadono su index.html
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSIONE).then(async c =>
    (await c.match(e.request, { ignoreSearch: true }))
    || fetch(e.request).catch(async () => (e.request.mode === 'navigate' ? c.match('index.html') : Response.error()))
  ));
});
