
const CACHE_NAME = 'com.greg.perfectdarts-v1.5.0';
const ASSETS = [
  "./.github/workflows/build-ios.yml",
  "./90",
  "./apk-qr.png",
  "./css/app.css",
  "./fonts/bebas-neue.ttf",
  "./img/game-bg.jpg",
  "./img/hero-dartboard.jpg",
  "./img/icons/A-cible-nuit.png",
  "./img/icons/app-icon.png",
  "./img/icons/B-neon-flechette.png",
  "./img/icons/C-flat-orange.png",
  "./img/icons/D-or-premium.png",
  "./index.html",
  "./js/boot.js",
  "./js/bot2.js",
  "./js/config.js",
  "./js/dartboard.js",
  "./js/game.js",
  "./js/net.js",
  "./js/sounds.js",
  "./js/stats.js",
  "./js/ui.js",
  "./js/voice.js",
  "./manifest.webmanifest",
  "./nitron.config.json",
  "./sounds/excellent_G_major.wav",
  "./sounds/finish-him.wav",
  "./sounds/flawless-victory_C_major.wav",
  "./sounds/impressive_A_minor.wav",
  "./sounds/round-1-fight_G_minor.wav",
  "./sounds/voice/fr/bull.wav",
  "./sounds/voice/fr/d1.wav",
  "./sounds/voice/fr/d10.wav",
  "./sounds/voice/fr/d11.wav",
  "./sounds/voice/fr/d12.wav",
  "./sounds/voice/fr/d13.wav",
  "./sounds/voice/fr/d14.wav",
  "./sounds/voice/fr/d15.wav",
  "./sounds/voice/fr/d16.wav",
  "./sounds/voice/fr/d17.wav",
  "./sounds/voice/fr/d18.wav",
  "./sounds/voice/fr/d19.wav",
  "./sounds/voice/fr/d2.wav",
  "./sounds/voice/fr/d20.wav",
  "./sounds/voice/fr/d3.wav",
  "./sounds/voice/fr/d4.wav",
  "./sounds/voice/fr/d5.wav",
  "./sounds/voice/fr/d6.wav",
  "./sounds/voice/fr/d7.wav",
  "./sounds/voice/fr/d8.wav",
  "./sounds/voice/fr/d9.wav",
  "./sounds/voice/fr/double-bull.wav",
  "./sounds/voice/fr/jeu.wav",
  "./sounds/voice/fr/manque.wav",
  "./sounds/voice/fr/n1.wav",
  "./sounds/voice/fr/n10.wav",
  "./sounds/voice/fr/n11.wav",
  "./sounds/voice/fr/n12.wav",
  "./sounds/voice/fr/n13.wav",
  "./sounds/voice/fr/n14.wav",
  "./sounds/voice/fr/n15.wav",
  "./sounds/voice/fr/n16.wav",
  "./sounds/voice/fr/n17.wav",
  "./sounds/voice/fr/n18.wav",
  "./sounds/voice/fr/n19.wav",
  "./sounds/voice/fr/n2.wav",
  "./sounds/voice/fr/n20.wav",
  "./sounds/voice/fr/n3.wav",
  "./sounds/voice/fr/n4.wav",
  "./sounds/voice/fr/n5.wav",
  "./sounds/voice/fr/n6.wav",
  "./sounds/voice/fr/n7.wav",
  "./sounds/voice/fr/n8.wav",
  "./sounds/voice/fr/n9.wav",
  "./sounds/voice/fr/rien.wav",
  "./sounds/voice/fr/t1.wav",
  "./sounds/voice/fr/t10.wav",
  "./sounds/voice/fr/t11.wav",
  "./sounds/voice/fr/t12.wav",
  "./sounds/voice/fr/t13.wav",
  "./sounds/voice/fr/t14.wav",
  "./sounds/voice/fr/t15.wav",
  "./sounds/voice/fr/t16.wav",
  "./sounds/voice/fr/t17.wav",
  "./sounds/voice/fr/t18.wav",
  "./sounds/voice/fr/t19.wav",
  "./sounds/voice/fr/t2.wav",
  "./sounds/voice/fr/t20.wav",
  "./sounds/voice/fr/t3.wav",
  "./sounds/voice/fr/t4.wav",
  "./sounds/voice/fr/t5.wav",
  "./sounds/voice/fr/t6.wav",
  "./sounds/voice/fr/t7.wav",
  "./sounds/voice/fr/t8.wav",
  "./sounds/voice/fr/t9.wav",
  "./sw.js",
  "./tests-run.log",
  "./manifest.json"
];

// Install Event: Cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching all assets');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Cleanup old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Cache First Strategy
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Return from cache
        }
        return fetch(event.request); // Network fallback
      })
  );
});
