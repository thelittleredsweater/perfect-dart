'use strict';
/* Verifie l auto-join : une page ?join=ABC123 doit afficher l erreur "Partie introuvable".
   Prerequis : Edge headless --remote-debugging-port=9223, server.cjs sur :3210. */
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
async function main() {
  const t = await jsonGet('/json/new?' + encodeURIComponent('http://127.0.0.1:3210/index.html?join=ABC123&cb=' + Date.now()), 'PUT');
  const s = await connectTarget(t.webSocketDebuggerUrl);
  await s.send('Page.enable');
  await s.send('Page.reload', { ignoreCache: true });
  await sleep(2500);
  const bootHasAutojoin = await s.eval(`fetch('js/boot.js?cb='+Math.random()).then(r=>r.text()).then(t=>t.indexOf('Lien d')>=0)`);
  const err = await s.eval(`document.getElementById('netJoinErr').textContent`);
  const overlay = await s.eval(`document.getElementById('netOverlay').classList.contains('show')`);
  console.log('boot.js sert l auto-join: ' + bootHasAutojoin + ' | overlay: ' + overlay + ' | erreur: "' + err + '"');
  await jsonGet('/json/close/' + t.id);
  process.exit(overlay && err.length > 3 ? 0 : 1);
}
main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });

