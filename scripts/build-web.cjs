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
console.log('relay/public : ' + n + ' fichiers copiés');
