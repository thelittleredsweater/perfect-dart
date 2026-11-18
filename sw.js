/* Cache hors-ligne pour Perfect Darts.
   Stratégie : assets statiques en cache-first (précalculés), navigation en
   network-first (une connexion propage les mises à jour), /qr jamais caché. */
'use strict';
var VERSION = 'pd-offline-v3';
var CORE_CACHE = 'pd-core-' + VERSION;

var PRECACHE = [
  'index.html',
  'css/app.css',
  'js/boot.js',
  'js/bot2.js',
  'js/config.js',
  'js/dartboard.js',
  'js/game.js',
  'js/net.js',
  'js/sounds.js',
  'js/stats.js',
  'js/ui.js',
  'js/voice.js',
  'img/game-bg.jpg',
  'img/hero-dartboard.jpg',
  'img/icons/app-icon.png',
  'img/icons/A-cible-nuit.png',
  'img/icons/B-neon-flechette.png',
  'img/icons/C-flat-orange.png',
  'img/icons/D-or-premium.png',
  'fonts/bebas-neue.ttf',
  'sounds/excellent_G_major.wav',
  'sounds/finish-him.wav',
  'sounds/flawless-victory_C_major.wav',
  'sounds/impressive_A_minor.wav',
  'sounds/round-1-fight_G_minor.wav',
  'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CORE_CACHE).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CORE_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/qr')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CORE_CACHE).then(function (c) { c.put('index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('index.html');
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CORE_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
