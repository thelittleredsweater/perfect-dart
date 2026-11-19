'use strict';
/* ============================================================
   Grand écran TV.
   - Téléphone (diffuseur) : « 📺 Grand écran » crée un salon sur le serveur
     du PC (npm run online) ; la partie reste locale (pavé sur le téléphone,
     plusieurs joueurs possibles) et son état est diffusé à chaque rendu.
   - TV / tablette (spectateur) : ouvre http://IP-du-PC:3210/?tv=CODE (ou
     scanne le QR) : tableau de scores géant + arbitre vocal, sans saisie.
   ============================================================ */

/* ---------- côté téléphone ---------- */
function tvHost() {
  saveServerAddr();
  const u = netUrl();
  if (netNeedsHttpRedirect(u)) { netRedirectToHttp('tv'); return; }
  netConnect(() => { netSend({ t: 'create' }); }, m => {
    if (m.t === 'created') {
      NET.mode = 'host'; NET.tv = true; NET.code = m.code;
      const base = String(m.joinUrl || ('http://' + netServerSaved())).replace(/\/+$/, '');
      const url = base + '/?tv=' + m.code;
      document.getElementById('netHome').style.display = 'none';
      document.getElementById('netTv').style.display = '';
      document.getElementById('tvCode').textContent = m.code;
      document.getElementById('tvUrl').textContent = url;
      document.getElementById('tvQr').src = base + '/qr?u=' + encodeURIComponent(url);
      tvCount(0);
    } else if (m.t === 'spectator-joined' || m.t === 'spectator-left') {
      tvCount(m.count);
      if (m.t === 'spectator-joined') { showToast('📺 Écran connecté', 'success'); NET.syncState(); }
    }
  }, () => { if (NET.tv) { NET.tv = false; NET.mode = null; showToast('📺 Grand écran déconnecté', 'error'); tvBadge(); } });
}
function tvCount(n) { const el = document.getElementById('tvViewers'); if (el) el.textContent = n ? `✅ ${n} écran${n > 1 ? 's' : ''} connecté${n > 1 ? 's' : ''}` : '⏳ En attente de la TV…'; }
/* Panneau fermé : la diffusion continue, on joue normalement depuis le menu. */
function tvDone() { netHidePanel(); tvBadge(); }
function tvStop() { NET.tv = false; if (NET.ws) { try { NET.ws.close(); } catch (e) {} } NET.ws = null; NET.mode = null; tvBadge(); netHidePanel(); }
function tvBadge() { const b = document.getElementById('tvBadge'); if (b) b.style.display = NET.tv ? '' : 'none'; }

/* ---------- côté TV ---------- */
let tvSoundOn = false;
function tvWatch(code) {
  document.body.dataset.tv = '1';
  showScreen('screenTV');
  try { ['mousemove', 'pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, tvIdle, { passive: true })); tvIdle(); if (typeof keepAwake === 'function') keepAwake(true); } catch (e) {}
  const wait = document.getElementById('tvWait');
  const set = t => { if (wait) { wait.textContent = t; wait.style.display = t ? '' : 'none'; } };
  set('Connexion au téléphone…');
  NET.mode = 'tv';
  const ok = netConnect(() => { netSend({ t: 'watch', code }); }, m => {
    if (m.t === 'watching') set('En attente de la partie…');
    else if (m.t === 'state') { NET.applyState(m.s); STATE.legsBestOf = m.s.legsBestOf || 1; set(''); renderTV(); }
    else if (m.t === 'event') { tvFlash(m); if (tvSoundOn) netEventSound(m); }
    else if (m.t === 'host-gone') set('Le téléphone a arrêté la diffusion.');
    else if (m.t === 'err') set(m.msg || 'Partie introuvable');
  }, () => set('Connexion perdue — rechargez la page pour reconnecter.'), code);
  if (!ok) set('Serveur injoignable');
}
function tvEnableSound() {
  tvSoundOn = true;
  try { const c = getAudioCtx(); if (c && c.state === 'suspended') c.resume(); preloadVoicePack(); } catch (e) {}
  const b = document.getElementById('tvSound'); if (b) b.style.display = 'none';
}
/* ---------- tableau de scores TV (1080p → 4K) ----------
   Tout est dimensionné en unités d'écran (vh/vw/vmin) : le texte et la cible
   sont vectoriels, donc nets à n'importe quelle résolution. */
function tvTournamentInfo() {
  try { const t = loadTourney(); if (!t) return null; const m = t.matches.find(x => x.id === STATE.tournamentMatch); const rounds = {}; t.matches.forEach(x => { (rounds[x.round] = rounds[x.round] || []).push(x); });
    return { label: m ? tnRoundName(t, rounds, m.round) : '', played: t.matches.filter(x => x.winner && !x.bye).length, total: t.format === 'ko' ? t.players.length - 1 : t.matches.length }; } catch (e) { return null; }
}
function tvAvg(p) { return p.dartsThrown ? (Math.round(30 * p.totalScored / p.dartsThrown) / 10).toFixed(1).replace('.', ',') : '–'; }
function renderTV() {
  const box = document.getElementById('tvPlayers'); if (!box) return;
  const x01 = typeof STATE.mode === 'number', crk = STATE.mode === 'cricket', cur = STATE.currentPlayer, esc = escapeHtml;
  const d = STATE.dartsThisTurn || [], visit = d.reduce((s, x) => s + x.value, 0), p0 = STATE.players[cur];
  const bo = (STATE.setsBestOf || 1) > 1 ? 'BO' + STATE.setsBestOf + ' sets' : (STATE.legsBestOf || 1) > 1 ? 'BO' + STATE.legsBestOf + ' legs · leg ' + (STATE.legNumber || 1) : '';
  const tn = STATE.tvTournament;
  document.getElementById('tvMode').innerHTML = `<b>${esc(x01 ? STATE.mode + (STATE.finishDouble ? ' Double out' : ' Straight out') : fmtMode(STATE.mode))}</b>${bo ? '<span>' + bo + '</span>' : ''}${tn ? '<span>🏆 ' + esc(tn.label || 'Tournoi') + '</span>' : ''}`;
  document.getElementById('tvTurn').innerHTML = STATE.gameOver ? 'Partie terminée' : p0 ? `<span class="tvt-dot"></span>Au tour de <b>${esc(p0.name)}</b>` : '';
  const n = STATE.players.length;
  document.getElementById('screenTV').dataset.layout = crk ? 'crk' : 'std';
  box.dataset.n = String(Math.min(n, 8));
  box.innerHTML = STATE.players.map((p, i) => {
    const on = i === cur && !STATE.gameOver;
    let sc = p.score, cls = '';
    if (x01 && on && visit) { const r = p.score - visit; if (r >= 0 && !(STATE.finishDouble && r === 1)) sc = r; }
    if (x01 && !STATE.gameOver && checkoutRoute(sc, on ? 3 - d.length : 3, STATE.finishDouble) && (!STATE.doubleIn || p.started)) cls = ' co';
    let main = `<div class="tvp-score${cls}">${sc}</div>`;
    if (STATE.mode === 'killer') main = `<div class="tvp-score sm">${p.lives > 0 ? '♥'.repeat(p.lives) : '☠'}</div><div class="tvp-sub">Double ${p.kNum}${p.isKiller ? ' · 🔪 KILLER' : ''}</div>`;
    const legs = (STATE.setsBestOf || 1) > 1 || (STATE.legsBestOf || 1) > 1 ? `<div class="tvp-legs">${(STATE.setsBestOf || 1) > 1 ? '<span>Sets <b>' + (p.sets || 0) + '</b></span>' : ''}<span>Legs <b>${p.legs || 0}</b></span></div>` : '';
    const stats = x01 ? `<div class="tvp-stats"><span>Moy. <b>${tvAvg(p)}</b></span><span>Dernière <b>${p.last != null ? p.last : '–'}</b></span><span>Fl. <b>${p.dartsThrown || 0}</b></span></div>`
      : crk ? '' : `<div class="tvp-stats"><span>Volées <b>${p.turns || 0}</b></span>${p.bestTurn ? '<span>Meilleure <b>' + p.bestTurn + '</b></span>' : ''}</div>`;
    return `<div class="tvp${on ? ' on' : ''}${STATE.gameOver && sc === 0 && x01 ? ' won' : ''}"><div class="tvp-name">${p.isBot ? '🤖 ' : ''}${esc(p.name)}</div>${main}${legs}${stats}</div>`;
  }).join('');
  /* Cricket : grille complète en grand */
  const cg = document.getElementById('tvCrk');
  if (cg) {
    if (!crk) cg.innerHTML = '';
    else {
      const T = [20, 19, 18, 17, 16, 15, 25], marks = i => (STATE.cricketMarks && STATE.cricketMarks[i]) || {};
      const live = {}; if (!STATE.gameOver) d.forEach(x => { if (T.includes(x.baseValue)) live[x.baseValue] = (live[x.baseValue] || 0) + (x.mult || 1); });
      const mk = (i, t) => { let m = marks(i)[t] || 0; if (i === cur) m += live[t] || 0; return m; };
      const sym = m => m >= 3 ? '<i class="ring">✕</i>' : m === 2 ? '✕' : m === 1 ? '╱' : '';
      const closedAll = t => STATE.players.every((_, i) => mk(i, t) >= 3);
      cg.style.setProperty('--n', n);
      cg.innerHTML = `<div class="tc-row tc-head"><div></div>${STATE.players.map((p, i) => `<div class="tc-name${i === cur && !STATE.gameOver ? ' on' : ''}">${esc(p.name)}</div>`).join('')}</div>`
        + T.map(t => `<div class="tc-row${closedAll(t) ? ' dead' : ''}"><div class="tc-t">${t === 25 ? 'Bull' : t}</div>${STATE.players.map((_, i) => `<div class="tc-m${i === cur && !STATE.gameOver ? ' on' : ''}${mk(i, t) >= 3 ? ' closed' : ''}">${sym(Math.min(3, mk(i, t)))}</div>`).join('')}</div>`).join('')
        + `<div class="tc-row tc-pts"><div class="tc-t">Pts</div>${STATE.players.map((p, i) => `<div class="tc-s${i === cur && !STATE.gameOver ? ' on' : ''}">${p.score}</div>`).join('')}</div>`;
    }
  }
  document.getElementById('tvDarts').innerHTML = [0, 1, 2].map(k => `<div class="tv-dart${d[k] ? ' f' : ''}">${d[k] ? esc(d[k].label) : ''}</div>`).join('') + `<div class="tv-visit">${visit || ''}</div>`;
  /* Objectif : checkout (X01) ou cible du mode d'entraînement / de jeu */
  let co = '', sub = '';
  if (!STATE.gameOver && p0) {
    if (x01) { const r = p0.score - visit; const route = (!STATE.doubleIn || p0.started) && checkoutRoute(r, 3 - d.length, STATE.finishDouble); if (route) { co = route; sub = 'Checkout'; } }
    else if (!crk && typeof modeFocus === 'function') { try { const f = modeFocus(); if (f && f.big) { co = f.big; sub = f.sub || ''; } } catch (e) {} }
  }
  const coEl = document.getElementById('tvCo');
  coEl.innerHTML = co ? `<small>${esc(sub)}</small><b>${esc(co)}</b>` : '';
  coEl.classList.toggle('show', !!co);
  document.getElementById('tvLog').innerHTML = (STATE.log || []).slice(0, 3).map(e => `<div>${esc(e.msg)}</div>`).join('');
  /* Fin de partie : bandeau vainqueur permanent */
  const win = document.getElementById('tvWin');
  if (win) {
    let w = null;
    /* X01 : celui qui est à 0 ; Cricket : le meilleur score ; autres modes : pas de bandeau. */
    if (STATE.gameOver) w = x01 ? STATE.players.find(p => p.score === 0) || null : crk ? STATE.players.slice().sort((a, b) => b.score - a.score)[0] || null : null;
    win.innerHTML = w ? `<div class="tw-cup">🏆</div><div class="tw-name">${esc(w.name)}</div><div class="tw-sub">remporte la partie</div>` : '';
    win.classList.toggle('show', !!w);
  }
}
/* Animation plein écran sur les gros scores, bust et checkout (événements de l'hôte). */
let tvFlashT = null;
function tvFlash(m) {
  const el = document.getElementById('tvFlash'); if (!el) return;
  let txt = '', cls = '';
  if (m.kind === 'score' && m.total >= 100) { txt = m.total === 180 ? 'ONE HUNDRED<br>AND EIGHTY!' : String(m.total); cls = m.total === 180 ? 'max' : 'big'; }
  else if (m.kind === 'bust') { txt = 'BUST'; cls = 'bust'; }
  else if (m.kind === 'gameshot') { txt = 'GAME SHOT!'; cls = 'gs'; }
  if (!txt) return;
  el.className = 'tv-flash'; void el.offsetWidth; el.innerHTML = txt; el.className = 'tv-flash show ' + cls;
  clearTimeout(tvFlashT); tvFlashT = setTimeout(() => { el.className = 'tv-flash'; }, m.total === 180 ? 2600 : 1600);
}
function tvFullscreen() { try { const e = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else (e.requestFullscreen || e.webkitRequestFullscreen).call(e); } catch (x) {} }
/* Curseur et boutons masqués après 3 s sans bouger (TV). */
let tvIdleT = null;
function tvIdle() { document.body.classList.remove('tv-idle'); clearTimeout(tvIdleT); tvIdleT = setTimeout(() => document.body.classList.add('tv-idle'), 3000); }
/* Sons/annonces reçus du diffuseur (TV et joueurs distants). */
function netEventSound(m) {
  if (m.kind === 'score') { announceVisitScore(m.total); return; }
  if (m.kind === 'remain') { announceRemaining(m.n); return; }
  if (m.kind === 'bust') { announceBust(); return; }
  if (m.kind === 'gameshot') { announceCheckout(); return; }
  playSound(m.kind === 'big' ? 'big' : m.kind);
}
/* Envoi d'une annonce aux autres écrans (diffuseur uniquement). */
function netEvt(o) { if (window.NET && NET.mode === 'host' && (NET.started || NET.tv)) netSend(Object.assign({ t: 'event' }, o)); }
