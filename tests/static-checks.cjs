'use strict';
/* Contrôles statiques Perfect Darts : cohérence HTML/JS/CSS/ressources. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = path.join(__dirname, '..');
let pass = 0, fail = 0; const faults = [];
function check(cond, label, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; faults.push(label + (extra ? ' — ' + extra : '')); console.log('  FAULT ' + label + (extra ? ' — ' + extra : '')); }
}
const read = f => fs.readFileSync(path.join(R, f), 'utf8');
const index = read('index.html');

/* 1. Tout onclick/bind a sa fonction definie. */
const calls = new Set();
for (const m of index.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)) calls.add(m[1]);
for (const f of fs.readdirSync(path.join(R, 'js'))) {
  for (const m of read('js/' + f).matchAll(/on(?:success|error)/g)) { /* rien */ }
}
const jsAll = fs.readdirSync(path.join(R, 'js')).map(f => read('js/' + f)).join('\n');
check([...calls].every(c => new RegExp('function\\s+' + c + '\\b|\\b' + c + '\\s*=\\s*function|const ' + c + '\\b|var ' + c + '\\b|let ' + c + '\\b').test(jsAll)), 'index.html : handlers onclick tous definis', [...calls].filter(c => !new RegExp('function\\s+' + c + '\\b|\\b' + c + '\\s*=').test(jsAll)).join(','));

/* 2. Tout getElementById statique existe dans index.html ou est cree dynamiquement. */
const htmlIds = new Set([...index.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
const jsFiles = fs.readdirSync(path.join(R, 'js'));
const dynamicIds = new Set(['slot0', 'slot1', 'slot2', 'boardGrid', 'playerName1', 'playerName2', 'playerName3', 'playerName4', 'playerName5', 'playerName6', 'favPlayers', 'bt-btn', 'chartScore',
  /* id absent de l'ecran setup par choix : lecture toujours gardee (cfgVoice || SETTINGS.voiceLang) */
  'cfgVoice']);
const missing = [];
for (const f of jsFiles) {
  const src = read('js/' + f);
  for (const m of src.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)) {
    const id = m[1];
    if (!htmlIds.has(id) && !dynamicIds.has(id)) {
      /* tolère si cree par innerHTML dans le code (une chaine contenant id="...") */
      if (!(src.includes('id="' + id + '"') || src.includes(`id='${id}'`))) missing.push(f + ':' + id);
    }
  }
  for (const m of src.matchAll(/getElementById\('(\w+)'\s*\+|\+ '(playerName\w*|slot\w*)'\)/g)) { dynamicIds.has(m[1]) || dynamicIds.add(m[1]); }
}
check(missing.length === 0, 'getElementById : ids servis partout', missing.join(', '));

/* 3. Table des checkouts : somme exacte + fin en double. */
const CHECKOUTS = vm.runInNewContext('(' + read('js/config.js').match(/const CHECKOUTS=(\{[^\n]*\})/)[1] + ')');
const sumOf = tokens => tokens.reduce((s, t) => {
  if (t === 'Bull') return s + 25; if (t === 'DBull') return s + 50;
  const m = t.match(/^([DT]?)(\d+)$/); if (!m) return NaN;
  return s + Number(m[2]) * (m[1] === 'T' ? 3 : m[1] === 'D' ? 2 : 1);
}, 0);
const badCO = [], badFin = [];
for (const [k, v] of Object.entries(CHECKOUTS)) {
  const toks = v.split(' ');
  if (sumOf(toks) !== Number(k)) badCO.push(k + '=' + v);
  const last = toks[toks.length - 1];
  if (!(last.startsWith('D') || last === 'DBull')) badFin.push(k + '=' + v);
}
/* 7 impossibles (159,162,163,165,166,168,169) volontairement absentes. */
const IMPOSSIBLE=new Set([159,162,163,165,166,168,169]);
check(Object.keys(CHECKOUTS).length === 169 - IMPOSSIBLE.size, 'CHECKOUTS : 162 entrees + les 7 impossibles', Object.keys(CHECKOUTS).length);
const have=new Set(Object.keys(CHECKOUTS).map(Number));
const absent=[...Array(169).keys()].slice(2).filter(k=>!have.has(k)&&!IMPOSSIBLE.has(k));
check(absent.length===0, 'CHECKOUTS : seules les 7 impossibles manquent', absent.join(', '));
check(badCO.length === 0, 'CHECKOUTS : sommes exactes', badCO.join('; '));
check(badFin.length === 0, 'CHECKOUTS : terminaison double partout', badFin.join('; '));

/* 4. Ressources referencees presentes (resolve depuis le dossier du fichier). */
const res = new Map();
for (const m of index.matchAll(/(?:src="|url\(['"]?)([\w./-]+\.(?:png|jpg|jpeg|svg|wav|ttf|woff2?))/g)) res.set(m[1], '.');
for (const m of read('css/app.css').matchAll(/url\(['"]?([\w./-]+\.(?:png|jpg|jpeg|svg|wav|ttf|woff2?))/g)) res.set(m[1], 'css');
for (const m of index.matchAll(/'(sounds\/[\w-]+\.wav)'/g)) res.set(m[1], '.');
const missRes = [];
for (const [r, from] of res) if (!fs.existsSync(path.join(R, from, r))) missRes.push(r);
check(missRes.length === 0, 'ressources : tout present', missRes.join(', '));

/* 5. Les fichiers js references existent + ordre de chargement. */
const scriptOrder = [...index.matchAll(/<script src="(js\/[\w.]+)"><\/script>/g)].map(m => m[1]);
const bot2Idx = scriptOrder.indexOf('js/bot2.js');
check(scriptOrder.includes('js/bot2.js') && bot2Idx > scriptOrder.indexOf('js/game.js') && bot2Idx < scriptOrder.indexOf('js/ui.js'), 'ordre de chargement : bot2 apres game.js et avant ui.js', scriptOrder.join(' > '));

/* 6. Etiquettes UI : pas de fonction/formule manquante evidente (syntaxe cache) */
jsFiles.forEach(f => { /* node --check fait deja la syntaxe ; rien ici */ });

console.log('\nSTATIQUE : ' + pass + ' PASS / ' + fail + ' FAULT');
if (faults.length) { console.log(faults.join('\n')); process.exit(1); }
