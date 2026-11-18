'use strict';
/* Test cricket headless : bot cricket actif, stats MOY/MEILLEUR, boîte règles, centrage historique. */
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
(async () => {
  const t = await jsonGet('/json/new?' + encodeURIComponent('http://127.0.0.1:3210/index.html?cb=' + Date.now()), 'PUT');
  const s = await connectTarget(t.webSocketDebuggerUrl);
  await sleep(1200);
  const out = {};
  // Regles au chargement (501 par defaut)
  out.rules501 = await s.eval(`document.getElementById('rulesText').textContent.slice(0,60)`);
  await s.eval(`PLAYER_COUNT=1;document.getElementById('cfgMode').value='cricket';applyModeFieldVisibility()`);
  out.rulesCricket = await s.eval(`document.getElementById('rulesText').textContent.slice(0,60)`);
  await s.eval(`startGame()`);
  await sleep(400); // c'est au joueur (index 0)
  await s.eval(`setMult(3);throwDart(20);setMult(3);throwDart(20);setMult(3);throwDart(20)`);
  await sleep(900);  // fin de volee auto
  await sleep(3200); // le bot joue son tour complet
  out.afterBot = await s.eval(`JSON.stringify({cur:STATE.currentPlayer,marks0:STATE.cricketMarks[0],marks1:STATE.cricketMarks[1],log:STATE.log.slice(0,2).map(l=>l.msg),gameOver:STATE.gameOver})`);
  out.botStats = await s.eval(`JSON.stringify({totalScored:STATE.players[1].totalScored,bestTurn:STATE.players[1].bestTurn,turns:STATE.players[1].turns})`);
  // Tour du joueur : 3x T20 encore -> surplus apres fermeture (20 deja ferme) -> +60
  await sleep(500);
  const cur = await s.eval(`STATE.currentPlayer`);
  if (cur === 0) { await s.eval(`setMult(3);throwDart(20);setMult(3);throwDart(20);setMult(3);throwDart(20)`); await sleep(4600); }
  out.afterVisit2 = await s.eval(`JSON.stringify({score:STATE.players.map(p=>p.score),marks1:STATE.cricketMarks[1],log:STATE.log.slice(0,2).map(l=>l.msg)})`);
  // Stats affichees quand c'est le tour du joueur
  out.statsPanel = await s.eval(`JSON.stringify({avg:document.getElementById('statAvg').textContent,turns:document.getElementById('statTurns').textContent,best:document.getElementById('statBest').textContent,cur:STATE.currentPlayer})`);
  out.cricketBoard = await s.eval(`(function(){const b=document.getElementById('cricketBoard');return {hidden:b.classList.contains('hidden'),rows:b.querySelectorAll('.cb-row').length,closed:b.querySelectorAll('.cb-m.closed').length}})()`);
  // Historique centre ?
  out.logBtn = await s.eval(`(function(){const b=document.getElementById('logToggleBtn');const cs=getComputedStyle(b);return {align:cs.alignSelf,m:cs.margin}})()`);
  // Dictée : textes attendus
  out.speech = await s.eval(`JSON.stringify([dartSpeech({baseValue:20,value:60,label:'T20',mult:3}),dartSpeech({baseValue:16,value:32,label:'D16',mult:2}),dartSpeech({baseValue:25,value:50,label:'DBull',mult:2}),dartSpeech({baseValue:0,value:0,label:'Manqué',mult:1})])`);
  await jsonGet('/json/close/' + t.id);
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
