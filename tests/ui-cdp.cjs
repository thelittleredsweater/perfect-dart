'use strict';
/* Suite UI CDP — parfait état des écrans. node tests/ui-cdp.cjs
   Prerequis : serveur :3210 + Edge headless CDP :9223. */
const http = require('http');
const WebSocket = require('ws');
function jsonGet(path, method = 'GET') {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: 9223, path, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(d); } });
    });
    r.on('error', rej); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connectTarget(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    let id = 0; const pending = new Map();
    ws.on('message', raw => { const m = JSON.parse(raw); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } });
    ws.on('open', () => res({
      send: (method, params = {}) => new Promise((rs, rj) => { const i = ++id; pending.set(i, { res: rs, rej: rj }); ws.send(JSON.stringify({ id: i, method, params })); }),
      eval: async expr => {
        const r = await new Promise((rs, rj) => { const i = ++id; pending.set(i, { res: rs, rej: rj }); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text);
        return r.result && r.result.value;
      },
      close: () => ws.close()
    }));
    ws.on('error', rej);
  });
}

let pass = 0, fault = 0;
const fails = [];
async function check(s, ok, label, detail) {
  if (ok) pass++; else { fault++; fails.push(label + (detail ? ' — ' + detail : '')); console.log('  [FAULT] ' + label + (detail ? ' — ' + detail : '')); }
}
const evl = (s, e) => s.eval(e);

(async () => {
  const t = await jsonGet('/json/new?' + encodeURIComponent('http://127.0.0.1:3210/index.html?cb=' + Date.now()), 'PUT');
  const s = await connectTarget(t.webSocketDebuggerUrl);
  await sleep(1200);

  /* 1. Ecran setup actif au chargement */
  out_setup: {
    const r = await evl(s, `JSON.stringify({setup:document.getElementById('screenSetup').classList.contains('active'),rules:(document.getElementById('rulesText')||{}).textContent})`);
    const o = JSON.parse(r);
    await check(s, o.setup === true, 'ecran setup actif au chargement');
    await check(s, (o.rules || '').includes('501'), 'regles 501 affichees au chargement', o.rules);
  }

  /* 2. Modes 901/1001 + 6 joueurs */
  {
    await evl(s, `PLAYER_COUNT=6;updatePlayerInputs();document.getElementById('cfgMode').value='901';startGame()`);
    await sleep(300);
    let o = JSON.parse(await evl(s, `JSON.stringify({mode:STATE.mode,n:STATE.players.length,scores:STATE.players.map(p=>p.score)})`));
    await check(s, o.mode === 901 && o.n === 6 && o.scores.every(x => x === 901), 'mode 901, 6 joueurs, scores a 901', r2(o));
    await evl(s, `document.getElementById('cfgMode').value='1001';startGame()`);
    await sleep(300);
    o = JSON.parse(await evl(s, `JSON.stringify({mode:STATE.mode,n:STATE.players.length})`));
    await check(s, o.mode === 1001 && o.n === 6, 'mode 1001 conserve les joueurs', r2(o));
  }

  /* 3. Double-in : (20,1) refuse, (20,2) ouvre */
  {
    await evl(s, `PLAYER_COUNT=1;updatePlayerInputs();document.getElementById('cfgMode').value='501';document.getElementById('cfgDoubleIn').checked=true;startGame()`);
    await sleep(300);
    await evl(s, `setMult(1);throwDart(20)`); await sleep(400);
    await evl(s, `setMult(2);throwDart(20)`); await sleep(400);
    await evl(s, `setMult(1);throwDart(20)`); await sleep(1600); // cloture auto de la volee
    const after = JSON.parse(await evl(s, `JSON.stringify({score:STATE.players[0].score,started:STATE.players[0].started})`));
    await check(s, after.started === true && after.score === 441, 'double-in : simple refuse, double ouvre (60 comptes)', r2(after));
  }

  /* 4. Undo : volee 3xT20 -> annulation -> score restitue (2 joueurs humains, pas de bot qui bloque) */
  {
    await evl(s, `PLAYER_COUNT=2;updatePlayerInputs();document.getElementById('cfgDoubleIn').checked=false;startGame()`);
    await sleep(300);
    await evl(s, `setMult(3);throwDart(20);setMult(3);throwDart(20);setMult(3);throwDart(20)`);
    await sleep(1700); // cloture de volee -> tour du joueur 2
    const mid = JSON.parse(await evl(s, `JSON.stringify({score:STATE.players[0].score,cur:STATE.currentPlayer})`));
    await check(s, mid.score === 321, 'volee 3xT20 comptabilisee', r2(mid));
    await evl(s, `undoLast()`);
    const u = JSON.parse(await evl(s, `JSON.stringify({score:STATE.players[0].score,cur:STATE.currentPlayer})`));
    await check(s, u.score === 501 && u.cur === 0, 'undo annule la volee entiere et restitue le score', r2(u));
  }

  /* 5. Themes : clair/sombre/OLED, meta theme-color */
  {
    await evl(s, `openSettings();document.getElementById('setTheme').value='light';document.getElementById('setOled').value='';persistSettings()`);
    const light = await evl(s, `JSON.stringify({t:document.body.dataset.theme,o:document.body.dataset.oled,m:document.querySelector('meta[name=theme-color]').getAttribute('content')})`);
    const ol = JSON.parse(light);
    await check(s, ol.t === 'light' && ol.o === '' && ol.m === '#eef1f8', 'theme clair applique', r2(ol));
    await evl(s, `document.getElementById('setTheme').value='dark';document.getElementById('setOled').value='1';persistSettings()`);
    const oled = JSON.parse(await evl(s, `JSON.stringify({t:document.body.dataset.theme,o:document.body.dataset.oled})`));
    await check(s, oled.t === 'dark' && oled.o === '1', 'sombre + OLED applique', r2(oled));
    const saved = await evl(s, `JSON.stringify({v:(localStorage.getItem(SETTINGS_KEY)||'')})`);
    const sv = JSON.parse(saved).v;
    await check(s, sv.includes('"theme":"dark"') && sv.includes('"oled":true'), 'reglages persistes en localStorage', sv.slice(0, 80));
  }

  /* 6. Reprise de partie */
  {
    await evl(s, `PLAYER_COUNT=2;updatePlayerInputs();document.getElementById('cfgMode').value='501';startGame()`);
    await sleep(300);
    await evl(s, `setMult(3);throwDart(20);setMult(3);throwDart(20);setMult(3);throwDart(20)`);
    await sleep(900);
    const before = JSON.parse(await evl(s, `JSON.stringify({scores:STATE.players.map(p=>p.score),cur:STATE.currentPlayer})`));
    await evl(s, `STATE.gameOver=false;resumeSavedGame()`);
    await sleep(300);
    const after = JSON.parse(await evl(s, `JSON.stringify({scores:STATE.players.map(p=>p.score),cur:STATE.currentPlayer,screen:document.querySelector('.screen.active').id})`));
    await check(s, JSON.stringify(after.scores) === JSON.stringify(before.scores), 'reprise retrouve les scores', r2({ before: before.scores, after: after.scores }));
    await check(s, after.screen === 'screenGame', 'reprise affine l ecran de jeu', after.screen);
  }

  /* 7. Quick scores masques en cricket */
  {
    await evl(s, `PLAYER_COUNT=2;updatePlayerInputs();document.getElementById('cfgMode').value='cricket';startGame()`);
    await sleep(300);
    const q = JSON.parse(await evl(s, `JSON.stringify({hidden:document.getElementById('quickScores').classList.contains('hidden')||getComputedStyle(document.getElementById('quickScores')).display==='none'})`));
    await check(s, q.hidden === true, 'scores rapides masques en cricket', r2(q));
  }

  /* 8. Bouton voix mute */
  {
    await evl(s, `openSettings();loadSettings&&loadSettings;showScreen('screenGame')`);
    const beforeM = await evl(s, `SETTINGS.voiceLang`);
    await evl(s, `toggleMute()`);
    const muted = await evl(s, `SETTINGS.voiceLang`);
    await evl(s, `toggleMute()`);
    const restored = await evl(s, `SETTINGS.voiceLang`);
    await check(s, muted === 'off' && restored === beforeM, 'bouton voix mute/unmute', beforeM + ' -> ' + muted + ' -> ' + restored);
  }

  /* 9. Overlay gagnant */
  {
    await evl(s, `PLAYER_COUNT=1;updatePlayerInputs();document.getElementById('cfgMode').value='501';startGame()`);
    await sleep(300);
    await evl(s, `STATE.players[0].score=40`);
    await evl(s, `setMult(2);throwDart(20)`);
    await sleep(800);
    const w = JSON.parse(await evl(s, `JSON.stringify({over:document.getElementById('winnerOverlay').classList.contains('active'),name:document.getElementById('winnerName').textContent,gameOver:STATE.gameOver})`));
    await check(s, w.over === true && w.gameOver === true, 'overlay gagnant affiche', r2(w));
  }

  /* 10. Ecran stats */
  {
    await evl(s, `showScreen('screenStats')`);
    const st = await evl(s, `document.querySelector('.screen.active').id`);
    await check(s, st === 'screenStats', 'ecran stats accessible', st);
  }

  await jsonGet('/json/close/' + t.id);
  console.log('\nRESULTAT UI-CDP : ' + pass + ' PASS / ' + fault + ' FAULT');
  if (fails.length) console.log('FAILLES :\n - ' + fails.join('\n - '));
  process.exit(fault ? 1 : 0);
  function r2(o) { return JSON.stringify(o).slice(0, 200); }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
