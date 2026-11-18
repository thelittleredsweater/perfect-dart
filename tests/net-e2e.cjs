'use strict';
/* Test E2E du relais server.cjs : create -> join -> start -> state -> dart -> undo/pass */
const WebSocket = require('ws');
const BASE = 'ws://127.0.0.1:3210';
const log = [];
const T0 = Date.now();
function t() { return (Date.now() - T0) + 'ms'; }
function waitMsg(ws, type, timeout = 3000) {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('timeout atente ' + type)), timeout);
    const h = raw => {
      try { const m = JSON.parse(raw); if (m.t === type) { ws.off('message', h); clearTimeout(timer); res(m); } } catch (e) {}
    };
    ws.on('message', h);
  });
}
async function main() {
  const host = new WebSocket(BASE);
  await new Promise((res, rej) => { host.on('open', res); host.on('error', rej); });
  log.push(t() + ' host: connecte');
  host.send(JSON.stringify({ t: 'create' }));
  const created = await waitMsg(host, 'created');
  log.push(t() + ' host: создан code=' + created.code + ' joinUrl=' + created.joinUrl);
  const code = created.code;

  const p1 = new WebSocket(BASE);
  await new Promise((res, rej) => { p1.on('open', res); p1.on('error', rej); });
  p1.send(JSON.stringify({ t: 'join', code, name: 'Alice' }));
  const joined = await waitMsg(p1, 'joined');
  log.push(t() + ' p1: joined seat=' + joined.seat);
  const pj = await waitMsg(host, 'player-joined');
  log.push(t() + ' host: player-joined ' + pj.name + ' seat=' + pj.seat + ' count=' + pj.count);
  const pj2 = await waitMsg(p1, 'player-joined');
  log.push(t() + ' p1: broadcast player-joined count=' + pj2.count);

  host.send(JSON.stringify({ t: 'start' }));
  const started = await waitMsg(p1, 'started');
  log.push(t() + ' p1: started seats=' + started.seats);

  host.send(JSON.stringify({ t: 'state', s: { mode: 501, currentPlayer: 1, players: [{ name: 'Hôte', score: 501 }, { name: 'Alice', score: 501 }] } }));
  const st = await waitMsg(p1, 'state');
  log.push(t() + ' p1: state relaye mode=' + st.s.mode + ' curseur=' + st.s.currentPlayer);

  p1.send(JSON.stringify({ t: 'dart', value: 20, mult: 3 }));
  const dart = await waitMsg(host, 'dart');
  log.push(t() + ' host: dart relaye value=' + dart.value + ' mult=' + dart.mult + ' seat=' + dart.seat);

  p1.send(JSON.stringify({ t: 'undo' }));
  const undo = await waitMsg(host, 'undo');
  log.push(t() + ' host: undo relaye seat=' + undo.seat);

  p1.close();
  const pl = await waitMsg(host, 'player-left');
  log.push(t() + ' host: player-left seat=' + pl.seat + ' count=' + pl.count);
  host.close();
  log.push(t() + ' FIN tout OK');
}
main().then(() => { console.log(log.join('\n')); process.exit(0); }).catch(e => { console.log(log.join('\n')); console.error('ECHEC: ' + e.message); process.exit(1); });
