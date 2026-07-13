const CACHE_NAME = 'birdle-marsh-madness-v21';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/gameLogic.js',
  './assets/marsh_madness_poster.png',
  './assets/intro_video.mp4',
  './assets/poster.png',
  './assets/marsh_backdrop.png',
  './assets/tutorial_sound.mp3',
  './assets/marsh_sounds.mp3',
  './assets/looking_through_scope.png',
  './assets/pwa-icon-192.png',
  './assets/pwa-icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/american_avocet.png',
  './assets/american_coot.png',
  './assets/black-necked_stilt.png',
  './assets/canada_goose.png',
  './assets/cinnamon_teal.png',
  './assets/great_egret.png',
  './assets/mallard.png',
  './assets/marsh_wren.png',
  './assets/northern_shoveler.png',
  './assets/red-winged_blackbird.png',
  './assets/snowy_egret.png',
  './assets/song_sparrow.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;
  if (event.request.headers.has('range')) {
    event.respondWith(handleRangeRequest(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

async function handleRangeRequest(request) {
  const cached = await caches.match(request.url);
  const response = cached ?? await fetch(request);
  const range = request.headers.get('range');
  if (!range) return response;

  const blob = await response.blob();
  const size = blob.size;
  const [, startText, endText] = /bytes=(\d+)-(\d*)/.exec(range) ?? [];
  const start = Number.parseInt(startText || '0', 10);
  const end = endText ? Number.parseInt(endText, 10) : size - 1;
  const sliced = blob.slice(start, end + 1);

  return new Response(sliced, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
      'Content-Length': String(sliced.size),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes'
    }
  });
}
