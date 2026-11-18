'use strict';
/* Serveur de parties en ligne pour Perfect Darts (reseaux local).
   Relais simple : l'hote detentionne l'etat du jeu, les joueurs renvoient leurs lancers.
   Lancement :  node server.js  (port 3210 par defaut)                      */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3210;
const ROOT = __dirname;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/qr')) {
    const url = new URL(req.url, 'http://x');
    const target = url.searchParams.get('u') || '';
    QRCode.toString(target, { type: 'svg', margin: 1, width: 240 }).then(svg => { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(svg); }).catch(() => { res.writeHead(500); res.end(); });
    return;
  }
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const file = pathname === '/' ? '/index.html' : pathname;
  const abs = path.join(ROOT, decodeURIComponent(file));
  if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
});

function lanIP() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs) { if (i.family === 'IPv4' && !i.internal) return i.address; }
  }
  return 'localhost';
}

function code6() { let s = ''; for (let i = 0; i < 6; i++) s += 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]; return s; }

const rooms = new Map(); // code -> {host: ws, players: [{ws, seat}], seats: n}
const wss = new WebSocketServer({ server });

function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} } }
function roomOf(ws) { for (const [code, r] of rooms) { if (r.host === ws || (r.players || []).some(p => p.ws === ws)) return [code, r, r.host === ws ? 'host' : 'player']; } return [null, null, null]; }

wss.on('connection', ws => {
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const [code, room, role] = roomOf(ws);
    switch (m.t) {
      case 'create': {
        let c; do { c = code6(); } while (rooms.has(c));
        rooms.set(c, { host: ws, players: [], seats: 1 });
        send(ws, { t: 'created', code: c, joinUrl: 'http://' + lanIP() + ':' + PORT + '/' });
        break;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        if (!r || r.host.readyState !== 1) { send(ws, { t: 'err', msg: 'Partie introuvable ou terminee' }); return; }
        if ((r.players || []).some(p => p.ws === ws)) return;
        const seat = (r.players || []).length ? Math.max(...r.players.map(p => p.seat)) + 1 : 1;
        r.players.push({ ws, seat, name: String(m.name || "").slice(0, 12) });
        send(ws, { t: 'joined', code, seat, name: String(m.name || '').slice(0, 12) });
        send(r.host, { t: 'player-joined', seat, name: String(m.name || '').slice(0, 12), count: r.players.length + 1 });
        (r.players || []).forEach(p => send(p.ws, { t: 'player-joined', seat, name: String(m.name || '').slice(0, 12), count: r.players.length + 1 }));
        break;
      }
      case 'start': {
        if (role === 'host') { (room.players || []).forEach(p => send(p.ws, { t: 'started', seats: (room.players || []).length + 1 })); }
        break;
      }
      case 'state': {
        if (role === 'host') { const data = JSON.stringify({ t: 'state', s: m.s }); room.players.forEach(p => { if (p.ws.readyState === 1) { try { p.ws.send(data); } catch (e) {} } }); }
        break;
      }
      case 'event': {
        if (role === 'host') { const data = JSON.stringify(m); room.players.forEach(p => { if (p.ws.readyState === 1) { try { p.ws.send(data); } catch (e) {} } }); }
        break;
      }
      case 'quick': case 'dart': case 'undo': case 'pass': case 'skip': {
        if (role === 'player') send(room.host, { ...m, seat: (room.players.find(p => p.ws === ws) || {}).seat });
        break;
      }
      case 'leave': {
        const [c2, r2, role2] = roomOf(ws);
        if (r2 && role2 === 'player') {
          const gone = r2.players.find(p => p.ws === ws);
          r2.players = (r2.players || []).filter(p => p.ws !== ws);
          send(r2.host, { t: 'player-left', seat: gone ? gone.seat : undefined, name: gone ? gone.name : '', count: r2.players.length + 1 });
        }
        break;
      }
      default: break;
    }
  });
  ws.on('close', () => {
    const [code, r, role] = roomOf(ws);
    if (!r) return;
    const gone = (r.players || []).find(p => p.ws === ws);
    r.players = (r.players || []).filter(p => p.ws !== ws);
    if (role === 'host') {
      r.players.forEach(p => send(p.ws, { t: 'host-gone' }));
      rooms.delete(code);
    } else {
      send(r.host, { t: 'player-left', seat: gone ? gone.seat : undefined, name: gone ? gone.name : '', count: r.players.length + 1 });
    }
  });
});

server.listen(PORT, () => {
  console.log('Perfect Darts en ligne :');
  console.log('  sur ce PC      : http://localhost:' + PORT + '/');
  console.log('  sur les telephones : http://' + lanIP() + ':' + PORT + '/');
});
