'use strict';
/* Test E2E du flux online complet via CDP (2 pages headless = 2 appareils).
   Prerequis : Edge headless avec --remote-debugging-port=9223, server.cjs sur :3210. */
const http = require('http');
const WebSocket = require('ws');
const BASE = 'http://127.0.0.1:9223';
const LOG = [];
function P(m) { LOG.push(m); console.log(m); }

function jsonGet(path, method = 'GET') {
  return new Promise((res, rej) => {
    const r = http.request({ host: '127.0.0.1', port: 9223, path, method }, resp => {
      let d = ''; resp.on('data', c => d += c); resp.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(d); } });
    });
    r.on('error', rej); r.end();
  });
}
function connectTarget(wsUrl) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    let id = 0; const pending = new Map();
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.id && pending.has(m.id)) { const { res: rs, rej: rj } = pending.get(m.id); pending.delete(m.id); m.error ? rj(new Error(m.error.message)) : rs(m.result); }
    });
    ws.on('open', () => res({
      eval: async (expr) => {
        const r = await new Promise((rs, rj) => {
          const i = ++id; pending.set(i, { res: rs, rej: rj });
          ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
        });
        if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
        return r.result && r.result.value;
      },
      close: () => ws.close()
    }));
    ws.on('error', rej);
  });
}
async function newPage(url) { const t = await jsonGet('/json/new?' + encodeURIComponent(url), 'PUT'); return connectTarget(t.webSocketDebuggerUrl); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitFor(pageSess, expr, label, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await pageSess.eval(expr);
    if (v) return v;
    await sleep(150);
  }
  throw new Error('timeout attente ' + label);
}

async function main() {
  const list = await jsonGet('/json/list');
  const targets = list.filter(t => t.type === 'page' && t.url.indexOf('127.0.0.1:3210') >= 0);
  if (targets.length < 2) throw new Error('il faut 2 pages ouvertes sur :3210 (trouve ' + targets.length + ')');
  // cible 0 : hôte, cible 1 : invité
  const A = targets[0], B = targets[1];
  const S = [await connectTarget(A.webSocketDebuggerUrl), await connectTarget(B.webSocketDebuggerUrl)];
  const [host, guest] = S;
  P('cibles: ' + A.url + ' | ' + B.url);
  // reload des deux pages pour prendre le dernier code
  await host.eval('location.reload()');
  await guest.eval('location.reload()');
  await sleep(1500);

  // HOTE : creer salon
  await host.eval(`(function(){document.getElementById('playerName1').value='Hote';openNetPanel();netHost();})()`);
  const code = await waitFor(host, `(document.getElementById('netRoomCode')||{textContent:''}).textContent.trim().length===6 ? document.getElementById('netRoomCode').textContent.trim() : false`, 'code salon');
  P('salon cree: ' + code);

  // INVITE : rejoindre
  await guest.eval(`(function(){openNetPanel();document.getElementById('netCode').value='${code}';document.getElementById('netName').value='Alice';netJoin();})()`);
  await waitFor(guest, `(function(){const w=document.getElementById('netWait');return w&&w.textContent.indexOf('En attente')>=0})()`, 'guest joined');
  P('guest joint (seat 1)');
  await waitFor(host, `document.getElementById('netPlayers').textContent.indexOf('Alice')>=0`, 'hote voit Alice');
  P('hote voit Alice');

  // LANCEMENT
  await host.eval(`netLaunch()`);
  await waitFor(host, `document.querySelector('#screenGame.active')!==null`, 'ecran jeu hote');
  await waitFor(guest, `document.querySelector('#screenGame.active')!==null`, 'ecran jeu invite');
  P('partie lancee des deux cotes');
  const hudWait = await waitFor(host, `document.getElementById('hudScores').textContent`, 'hud hote');
  P('HUD hote: ' + hudWait.replace(/\s+/g, ' ').trim());
  await sleep(2000);
  const diagG = await guest.eval(`(function(){
    return {
      mode:(typeof NET!=='undefined')?NET.mode:'NO_NET',
      started:NET.started,
      wsReady:NET.ws?NET.ws.readyState:'no-ws',
      players:(STATE.players||[]).length,
      cur:STATE.currentPlayer,
      hud:document.getElementById('hudScores').textContent,
      active:(document.querySelector('.screen.active')||{id:'?'}).id
    };
  })()`);
  P('diag invité: ' + JSON.stringify(diagG));
  const diagH = await host.eval(`(function(){return {mode:NET.mode,started:NET.started,wsReady:NET.ws?NET.ws.readyState:'no'};})()`);
  P('diag hôte: ' + JSON.stringify(diagH));
  const hudG = await waitFor(guest, `document.getElementById('hudScores').textContent`, 'hud invite');
  P('HUD invite: ' + hudG.replace(/\s+/g, ' ').trim());

  //cles controle : l invite doit etre verrouille au tour de l hote
  const locked1 = await guest.eval(`document.getElementById('boardGrid').classList.contains('net-locked')`);
  P('invite verrouille au tour hote: ' + locked1);

  // lancer du cote invite (client) pour le tour d Alice : envoie dart au serveur
  // ( guests CAN throw when it is their turn; we check the pipe both ways )
  // 1) l hote joue ses 3 darts T20
  await host.eval(`throwDart(20,3);throwDart(20,3);throwDart(20,3)`);
  await sleep(1800); // endTurn 450 + renderAll sync
  const g1 = await guest.eval(`document.getElementById('hudScores').textContent.replace(/\\s+/g,' ')`);
  P('HUD invite apres 3xT20 hote: ' + g1.trim());
  // 2) le tour passe a Alice (seat 1) : l invite doit etre deverrouille
  const locked2 = await guest.eval(`document.getElementById('boardGrid').classList.contains('net-locked')`);
  P('invite verrouille au tour Alice: ' + locked2 + ' (attend: false)');
  await guest.eval(`throwDart(19,3)`);
  await sleep(1200);
  const h1 = await host.eval(`document.getElementById('hudScores').textContent.replace(/\\s+/g,' ')`);
  const slots = await host.eval(`Array.from(document.querySelectorAll('.dart-value')).map(function(e){return e.textContent}).join(',')`);
  P('HUD hote apres dart invite (attend Alice 481->424 ou slot 57): ' + h1.trim() + ' | slots: ' + slots);
  P('FIN OK');
  return LOG.join('\n');
}
main().then(r => { process.exit(0); }).catch(e => { console.error('ECHEC: ' + e.message); process.exit(1); });
