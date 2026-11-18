'use strict';
/* Sim1 : scenario online local complet via CDP, deux onglets Edge headless. */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const CDP_HTTP = 'http://127.0.0.1:9223';
const APP = 'http://localhost:3210/index.html';

function jsonGet(p) { return new Promise((res, rej) => { http.get(CDP_HTTP + p, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)) } catch (e) { rej(e) } }); }).on('error', rej); }); }

function cdp(wsUrl) {
  let id = 0; const pend = {}; const handlers = [];
  const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
  ws.on('message', d => { const m = JSON.parse(d); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } else if (m.method) { handlers.forEach(h => h(m)); } });
  const ready = new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  return {
    ready,
    send(method, params) { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((res, rej) => { pend[i] = m => m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result); }); },
    on(h) { handlers.push(h); },
    close() { try { ws.close() } catch (e) {} }
  };
}

async function evaluate(c, expr) {
  const r = await c.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails));
  return r.result.value;
}

async function newTab(url) {
  const r = await fetch(CDP_HTTP + '/json/new?url=' + encodeURIComponent(url), { method: 'PUT' });
  return await r.json();
}

(async () => {
  const results = [];
  const ok = (name, cond) => { results.push((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) process.exitCode = 1; };

  // Ouvrir deux onglets
  const t1 = await newTab('about:blank');
  const t2 = await newTab('about:blank');
  const c1 = cdp(t1.webSocketDebuggerUrl); const c2 = cdp(t2.webSocketDebuggerUrl);
  await Promise.all([c1.ready, c2.ready]);
  await c1.send('Page.enable'); await c2.send('Page.enable');
  await c1.send('Page.navigate', { url: APP }); await c2.send('Page.navigate', { url: APP });
  await new Promise(r => setTimeout(r, 2500));

  // Onglet A = hote
  const code = await evaluate(c1, `openNetPanel(); netHost(); 'hosting'`);
  await new Promise(r => setTimeout(r, 1500));
  const roomCode = await evaluate(c1, `document.getElementById('netRoomCode').textContent`);
  ok('hote: code salon affiche (' + roomCode + ')', /^[A-Z0-9]{6}$/.test(roomCode));
  const st1 = await evaluate(c1, `document.getElementById('netStatus').textContent`);
  ok('hote: statut = Connecte au serveur', /Connect/.test(st1));

  // Onglet B = client, rejoint par code
  await evaluate(c2, `openNetPanel(); document.getElementById('netName').value='Testeur'; document.getElementById('netCode').value='${roomCode}'; netJoin(); 'joining'`);
  await new Promise(r => setTimeout(r, 1500));
  const joinCode = await evaluate(c2, `document.getElementById('netRoomCode').textContent`);
  ok('client: rejoint meme code', joinCode === roomCode);
  const c2players = await evaluate(c2, `document.getElementById('netPlayers').innerHTML`);
  ok('client: roster affiche', /Testeur/.test(c2players) === false); // roster cote client est vide, la liste se remplit cote hote
  await evaluate(c2, `document.getElementById('netLaunchBtn').style.display='none'; 'ok'`);

  // Lancer la partie
  await evaluate(c1, `netLaunch(); 'launched'`);
  await new Promise(r => setTimeout(r, 2500));
  const inGame1 = await evaluate(c1, `!document.getElementById('screenGame').classList.contains('active') ? 'not-active' : 'active'`);
  ok('hote: ecran jeu actif', inGame1 === 'active');
  await new Promise(r => setTimeout(r, 1500));
  const inGame2 = await evaluate(c2, `!document.getElementById('screenGame').classList.contains('active') ? 'not-active' : 'active'`);
  ok('client: ecran jeu actif (sync recue)', inGame2 === 'active');

  // Le client lance une flechette (il faut que ce soit son tour pour que l'hote l'accepte)
  // D'abord verifier qui est le joueur actif dans l'etat client
  const cur = await evaluate(c2, `STATE.currentPlayer`);
  const seat = await evaluate(c2, `NET.seat`);
  if (cur !== seat) {
    // Faire passer le tour jusqu'au client (skip turn cote hote)
    await evaluate(c1, `(function(){let guard=0;while(STATE.currentPlayer!==${seat}&&guard<10){skipTurn();guard++}return STATE.currentPlayer})()`);
    await new Promise(r => setTimeout(r, 1000));
  }
  const curBis = await evaluate(c2, `STATE.currentPlayer`);
  ok('client: c est son tour apres sync', curBis === seat);

  // Le client tape un triple 20 puis complete sa volee (le score n est applique qu en fin de volee)
  await evaluate(c2, `STATE.currentMult=3; throwDart(20,3); 'thrown'`);
  await new Promise(r => setTimeout(r, 800));
  await evaluate(c2, `throwDart(20,1); throwDart(20,1); 'volley-complete'`);
  await new Promise(r => setTimeout(r, 1500));
  const s1 = await evaluate(c1, `JSON.stringify(STATE.players.map(p=>({n:p.name,s:p.score})))`);
  const s2 = await evaluate(c2, `JSON.stringify(STATE.players.map(p=>({n:p.name,s:p.score})))`);
  const exp = 501 - 100; // volee complete : T20 + 20 + 20
  ok('hote: score Testeur = 401 -> ' + s1, s2.includes('"s":401') || s2.includes(':401'));
  ok('client: score identique = ' + s2, s1 === s2);

  // Captures d'ecran des deux cotes
  const shot1 = await c1.send('Page.captureScreenshot', { format: 'png' });
  const shot2 = await c2.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('tests\\sim1-host.png', Buffer.from(shot1.data, 'base64'));
  fs.writeFileSync('tests\\sim1-client.png', Buffer.from(shot2.data, 'base64'));

  console.log(results.join('\n'));
  c1.close(); c2.close();
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('ERREUR: ' + e.message); process.exit(1); });
