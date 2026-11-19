/* ============================================================
   Perfect Darts — relais en ligne (Cloudflare Workers).
   - Sert l'application web (dossier public/, copié par scripts/build-web.cjs) :
     la TV ouvre https://<relais>/?tv=CODE et dessine son propre tableau de
     scores à sa résolution native (jusqu'en 4K).
   - /ws : WebSocket. Un salon = un Durable Object (même protocole que server.cjs) :
     le téléphone hôte crée le salon et diffuse l'état ; écrans TV (watch) et
     joueurs distants (join) le rejoignent avec le code à 6 caractères.
   - /qr?u=... : QR code SVG de l'adresse à scanner.
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import QRCode from 'qrcode';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function code6() { const b = new Uint8Array(6); crypto.getRandomValues(b); return Array.from(b, x => ALPHABET[x % ALPHABET.length]).join(''); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') {
      if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('WebSocket attendu', { status: 426 });
      let code = (url.searchParams.get('code') || '').toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) code = code6(); // création d'un salon
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const h = new Headers(req.headers);
      h.set('X-Room-Code', code); h.set('X-Origin', url.origin);
      return stub.fetch(new Request(req, { headers: h }));
    }
    if (url.pathname === '/qr') {
      const u = (url.searchParams.get('u') || '').slice(0, 400);
      if (!u) return new Response('', { status: 400 });
      const svg = await QRCode.toString(u, { type: 'svg', margin: 1, width: 240 });
      return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
    }
    if (url.pathname === '/health') return new Response('ok');
    return env.ASSETS.fetch(req);
  },
};

/* Salon : l'hôte détient l'état du jeu, le relais ne fait que transmettre.
   API « hibernation » : le salon ne consomme rien entre deux messages. */
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastState = null;
    /* Ping applicatif sans réveiller l'objet (garde la connexion ouverte). */
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }
  async fetch(req) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, code: req.headers.get('X-Room-Code'), origin: req.headers.get('X-Origin') });
    return new Response(null, { status: 101, webSocket: client });
  }
  att(ws) { try { return ws.deserializeAttachment() || {}; } catch (e) { return {}; } }
  socks(role, except) { return this.ctx.getWebSockets().filter(w => w !== except && this.att(w).role === role); }
  send(ws, o) { try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch (e) {} }
  relay(data) { for (const w of this.ctx.getWebSockets()) { const r = this.att(w).role; if (r === 'player' || r === 'spectator') this.send(w, data); } }

  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); } catch (e) { return; }
    const a = this.att(ws), host = this.socks('host')[0];
    switch (m.t) {
      case 'create': {
        if (host && host !== ws) { this.send(ws, { t: 'err', msg: 'Code déjà utilisé, réessaie' }); return; }
        a.role = 'host'; ws.serializeAttachment(a);
        this.send(ws, { t: 'created', code: a.code, joinUrl: a.origin + '/' });
        break;
      }
      case 'join': {
        if (!host) { this.send(ws, { t: 'err', msg: 'Partie introuvable ou terminée' }); return; }
        if (a.role === 'player') return;
        const players = this.socks('player');
        const seat = players.length ? Math.max(...players.map(p => this.att(p).seat || 0)) + 1 : 1;
        const name = String(m.name || '').slice(0, 12);
        Object.assign(a, { role: 'player', seat, name }); ws.serializeAttachment(a);
        this.send(ws, { t: 'joined', code: a.code, seat, name });
        const msg = { t: 'player-joined', seat, name, count: players.length + 2 };
        this.send(host, msg); players.forEach(p => this.send(p, msg));
        break;
      }
      case 'watch': {
        if (!host) { this.send(ws, { t: 'err', msg: 'Partie introuvable ou terminée' }); return; }
        a.role = 'spectator'; ws.serializeAttachment(a);
        this.send(ws, { t: 'watching', code: a.code });
        if (this.lastState) this.send(ws, { t: 'state', s: this.lastState });
        /* L'hôte renvoie l'état complet à chaque nouvel écran (utile après hibernation). */
        this.send(host, { t: 'spectator-joined', count: this.socks('spectator').length });
        break;
      }
      case 'start': if (a.role === 'host') { const pl = this.socks('player'); pl.forEach(p => this.send(p, { t: 'started', seats: pl.length + 1 })); } break;
      case 'state': if (a.role === 'host') { this.lastState = m.s; this.relay({ t: 'state', s: m.s }); } break;
      case 'event': if (a.role === 'host') this.relay(m); break;
      case 'quick': case 'dart': case 'undo': case 'pass': case 'skip':
        if (a.role === 'player' && host) this.send(host, Object.assign({}, m, { seat: a.seat }));
        break;
      case 'leave': if (a.role === 'player') this.left(ws, a); break;
      default: break;
    }
  }
  left(ws, a) {
    const host = this.socks('host', ws)[0];
    if (a.role === 'host') {
      for (const w of this.ctx.getWebSockets()) if (w !== ws) this.send(w, { t: 'host-gone' });
      this.lastState = null;
    } else if (a.role === 'spectator') {
      if (host) this.send(host, { t: 'spectator-left', count: this.socks('spectator', ws).length });
    } else if (a.role === 'player') {
      if (host) this.send(host, { t: 'player-left', seat: a.seat, name: a.name || '', count: this.socks('player', ws).length + 1 });
    }
    a.role = null; try { ws.serializeAttachment(a); } catch (e) {}
  }
  async webSocketClose(ws, code, reason) { this.left(ws, this.att(ws)); try { ws.close(code, reason); } catch (e) {} }
  async webSocketError(ws) { this.left(ws, this.att(ws)); }
}
