'use strict';
/* Verifie le chemin de redirection APK : ?create=1 doit creer un salon tout seul,
   et ?join=CODE&name= doit rejoindre ce salon (avec le pseudo passe en URL).
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
function main() {
  (async () => {
    /* 1. Onglet hote : ?create=1 doit creer le salon automatiquement. */
    console.log('PASS(host) ouverture ?create=1');
    const h = await jsonGet('/json/new?' + encodeURIComponent('http://127.0.0.1:3210/index.html?create=1&cb=' + Date.now()), 'PUT');
    await sleep(1500);
    const s = await connectTarget(h.webSocketDebuggerUrl);
    await s.send('Page.enable');
    await s.send('Page.reload', { ignoreCache: true });
    await sleep(3000);
    const home = await s.eval(`document.getElementById('netHome').style.display`);
    const lobby = await s.eval(`document.getElementById('netLobby').style.display`);
    const code = await s.eval(`document.getElementById('netRoomCode').textContent`);
    const status = await s.eval(`document.getElementById('netStatus').textContent`);
    console.log('PASS(host) netHome:' + home + ' netLobby:' + lobby + ' code:' + code + ' status:"' + status + '"');
    const created = home === 'none' && lobby === '' && /^[A-Z0-9]{6}$/.test(code);
    if (!created) { await jsonGet('/json/close/' + h.id); process.exit(1); }
    console.log('PASS(hote) ?create=1 a cree le salon ' + code);

    /* 2. Onglet invite : ?join=CODE&name= doit rejoindre avec le pseudo. */
    console.log('PASS(client) ouverture ?join=' + code + '&name=Gigi');
    const c = await jsonGet('/json/new?' + encodeURIComponent('http://127.0.0.1:3210/index.html?join=' + code + '&name=Gigi&cb=' + Date.now()), 'PUT');
    await sleep(1500);
    const s2 = await connectTarget(c.webSocketDebuggerUrl);
    await s2.send('Page.enable');
    await s2.send('Page.reload', { ignoreCache: true });
    await sleep(3000);
    const wait = await s2.eval(`document.getElementById('netWait').textContent`);
    const lobby2 = await s2.eval(`document.getElementById('netLobby').style.display`);
    const err2 = await s2.eval(`document.getElementById('netJoinErr').textContent`);
    console.log('PASS(client) netLobby:' + lobby2 + ' netWait:"' + wait + '" err:"' + err2 + '"');

    /* 3. Cote hote : Gigi doit apparaitre dans la liste. */
    await sleep(1500);
    const guests = await s.eval(`document.getElementById('netPlayers').innerHTML`);
    const hasGigi = guests.indexOf('Gigi') >= 0;
    console.log('PASS(hote) liste joueurs: ' + (hasGigi ? 'contient Gigi' : 'SANS Gigi -> ' + guests.slice(0, 200)));
    await jsonGet('/json/close/' + h.id);
    await jsonGet('/json/close/' + c.id);
    process.exit(hasGigi && lobby2 === '' ? 0 : 1);
  })().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
}
main();
