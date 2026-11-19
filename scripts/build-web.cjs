'use strict';
/* Copie l'application web dans relay/public (servie par le relais Cloudflare).
   Usage : node scripts/build-web.cjs   (appelé par npm run dev / deploy dans relay/) */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'relay', 'public');
const items = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'fonts', 'img', 'sounds'];
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let n = 0;
function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) { fs.mkdirSync(dst, { recursive: true }); for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f)); }
  else if (!/\.(wav)$/i.test(src) || /sounds[\\/][^\\/]+\.wav$/i.test(src)) { fs.copyFileSync(src, dst); n++; }
}
for (const it of items) { const s = path.join(root, it); if (fs.existsSync(s)) copy(s, path.join(out, it)); }
/* Pages de téléchargement (/android, /iphone) et dernier APK. */
for (const f of fs.readdirSync(path.join(root, 'site'))) { fs.copyFileSync(path.join(root, 'site', f), path.join(out, f)); n++; }
const apks = fs.existsSync(path.join(root, 'dist')) ? fs.readdirSync(path.join(root, 'dist')).filter(f => /^perfect-darts-v[\d.]+\.apk$/.test(f)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
if (apks.length) { fs.mkdirSync(path.join(out, 'download'), { recursive: true }); fs.copyFileSync(path.join(root, 'dist', apks[apks.length - 1]), path.join(out, 'download', 'perfect-darts.apk')); console.log('APK publié : ' + apks[apks.length - 1]); }
/* version.json : lu au démarrage par l'appli pour proposer / appliquer les mises à jour. */
const version = require(path.join(root, 'package.json')).version;
const cfg = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const m = cfg.match(/APP_VERSION='([^']+)'/);
if (!m || m[1] !== version) { console.error('ERREUR : APP_VERSION (js/config.js) = ' + (m && m[1]) + ' mais package.json = ' + version); process.exit(1); }
const notesFile = path.join(root, 'site', 'release-notes.txt');
const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, 'utf8').split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean) : [];
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version, notes, date: new Date().toISOString() }));
fs.rmSync(path.join(out, 'release-notes.txt'), { force: true });
console.log('version.json : ' + version);
console.log('relay/public : ' + n + ' fichiers copiés');
