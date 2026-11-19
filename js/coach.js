'use strict';
/* ============================================================
   Coach de checkout personnalisé.
   - Chaque fléchette tentée sur un double (finish d'une fléchette en X01,
     double visé en « Doubles aléatoires », finish en 121) est comptée par
     segment : tentatives / réussites, par joueur (pas les bots).
   - Mémoire persistante : carrière (localStorage), clé c.dbl[nom][seg]=[tent,touch].
   - coachRoute(reste, fléchettes, nom) cherche, parmi toutes les routes
     faisables, celle qui maximise la probabilité de finir avec LES doubles
     du joueur (estimation bayésienne : peu de données -> taux moyen).
   ============================================================ */
const COACH_MIN_ATTEMPTS = 12;   // en dessous : pas assez de données, route standard
const COACH_PRIOR = 8;           // poids du taux moyen dans l'estimation
let coachVersion = 0;
const coachCache = {};

/* ---------- enregistrement ---------- */
function recordDoubleAttempt(player, seg, hit) {
  if (!player || player.isBot || !(seg >= 1 && (seg <= 20 || seg === 25))) return;
  player.dbl = player.dbl || {};
  const s = player.dbl[seg] = player.dbl[seg] || [0, 0];
  s[0]++; if (hit) s[1]++;
  coachVersion++;
}
/* Fin de partie / d'entraînement : cumul dans la carrière (une seule fois). */
function saveDoubleStats() {
  const c = loadCareer(); c.dbl = c.dbl || {};
  STATE.players.forEach(p => {
    if (p.isBot || !p.dbl || p.dblSaved) return;
    const dst = c.dbl[p.name] = c.dbl[p.name] || {};
    Object.keys(p.dbl).forEach(seg => { const a = dst[seg] = dst[seg] || [0, 0]; a[0] += p.dbl[seg][0]; a[1] += p.dbl[seg][1]; });
    p.dblSaved = true;
  });
  saveCareer(c); coachVersion++;
}
/* Statistiques combinées : carrière + partie en cours (si pas encore sauvée). */
function doubleStatsOf(name) {
  const c = loadCareer(), base = (c.dbl && c.dbl[name]) || {}, out = {};
  Object.keys(base).forEach(s => { out[s] = base[s].slice(); });
  const live = STATE.players.find(p => p.name === name && !p.isBot);
  if (live && live.dbl && !live.dblSaved) Object.keys(live.dbl).forEach(s => { const a = out[s] = out[s] || [0, 0]; a[0] += live.dbl[s][0]; a[1] += live.dbl[s][1]; });
  return out;
}
function doubleRates(name) {
  const st = doubleStatsOf(name);
  let att = 0, hit = 0;
  Object.values(st).forEach(a => { att += a[0]; hit += a[1]; });
  const mean = att ? Math.max(0.05, hit / att) : 0.25;
  const rate = seg => { const a = st[seg] || [0, 0]; return (a[1] + COACH_PRIOR * mean) / (a[0] + COACH_PRIOR); };
  return { att, mean, rate, st };
}

/* ---------- route personnalisée ---------- */
const tokVal = t => (t === 'DBull' ? 50 : t === 'Bull' ? 25 : t[0] === 'T' ? 3 * t.slice(1) : t[0] === 'D' ? 2 * t.slice(1) : +t);
const tokSeg = t => (t === 'DBull' || t === 'Bull' ? 25 : +(t[0] === 'T' || t[0] === 'D' ? t.slice(1) : t));
function coachRoute(rem, darts, name) {
  if (!name || !(rem >= 2 && rem <= CHECKOUT_MAX) || !(darts >= 1)) return null;
  const R = doubleRates(name);
  if (R.att < COACH_MIN_ATTEMPTS) return null;
  const key = name + '|' + rem + '|' + darts + '|' + coachVersion;
  if (key in coachCache) return coachCache[key];
  /* Probabilités de placement : simple sûr, triple plus risqué, doubles du joueur. */
  const pTok = t => (t === 'DBull' ? R.rate(25) * 0.8 : t === 'Bull' ? 0.45 : t[0] === 'T' ? 0.3 + R.mean * 0.4 : t[0] === 'D' ? R.rate(+t.slice(1)) : 0.9);
  let best = null;
  for (let n = 1; n <= darts; n++) {
    const walk = (left, depth, acc, p) => {
      if (depth === n - 1) {
        for (const [tok, v] of CO_DOUBLES) if (v === left) {
          const pr = p * (tok === 'DBull' ? R.rate(25) * 0.8 : R.rate(+tok.slice(1)));
          if (!best || pr > best.p + 1e-9) best = { route: acc.concat(tok).join(' '), p: pr, fin: tok };
        }
        return;
      }
      for (const [tok, v] of CO_SETUP) if (v < left - 1) walk(left - v, depth + 1, acc.concat(tok), p * pTok(tok));
    };
    walk(rem, 0, [], 1);
  }
  let res = null;
  if (best) {
    const std = checkoutRoute(rem, darts, true);
    /* Route standard conservée si elle est presque aussi bonne (moins déroutant). */
    if (std) {
      const toks = std.split(' ');
      const pStd = toks.reduce((p, t, i) => p * (i === toks.length - 1 ? (t === 'DBull' ? R.rate(25) * 0.8 : R.rate(tokSeg(t))) : pTok(t)), 1);
      if (pStd >= best.p * 0.97) best = { route: std, p: pStd, fin: toks[toks.length - 1] };
    }
    const seg = tokSeg(best.fin);
    res = { route: best.route, seg, pct: Math.round(100 * R.rate(seg)), standard: best.route === std };
  }
  coachCache[key] = res;
  return res;
}
/* Meilleurs doubles d'un joueur (écran Statistiques). */
function bestDoubles(name, n) {
  const R = doubleRates(name);
  return Object.keys(R.st).filter(s => R.st[s][0] >= 3)
    .map(s => ({ seg: +s, att: R.st[s][0], pct: Math.round(100 * R.st[s][1] / R.st[s][0]) }))
    .sort((a, b) => b.pct - a.pct || b.att - a.att).slice(0, n || 3);
}

/* ============================================================
   Adversaire à ton image : « Mon double » (bot calibré sur ta moyenne
   de carrière) et « Mon fantôme » (rejoue ta meilleure partie X01,
   fléchette par fléchette). Records : c.ghosts[nom][mode-do|so].
   ============================================================ */
function ghostKey() { return STATE.mode + '-' + (STATE.finishDouble ? 'do' : 'so'); }
function careerAvgOf(name) { const p = loadCareer().profiles[name]; return p && p.darts >= 9 ? avg3(p) : 0; }
function ghostOf(name, key) { const g = loadCareer().ghosts; return (g && g[name] && g[name][key]) || null; }
/* Fin de partie X01 simple (1 leg, sans double-in ni handicap) : record du gagnant. */
function recordGhost(winner) {
  if (!winner || winner.isBot || !isX01Mode() || STATE.doubleIn || (typeof isMatchFormat === 'function' && isMatchFormat()) || STATE.handicap) return false;
  const visits = STATE.throwHistory.filter(h => h.player === winner.name).map(h => h.darts.map(d => ({ baseValue: d.baseValue, value: d.value, label: d.label, mult: d.mult, ndarts: d.ndarts })));
  const darts = winner.dartsThrown;
  if (!visits.length || !darts) return false;
  const c = loadCareer(); c.ghosts = c.ghosts || {};
  const mine = c.ghosts[winner.name] = c.ghosts[winner.name] || {}, key = ghostKey();
  if (mine[key] && mine[key].darts <= darts) return false;
  mine[key] = { darts, visits, date: new Date().toISOString() };
  saveCareer(c);
  STATE.log.unshift({ msg: `👻 Nouveau record (${darts} fléchettes) : votre fantôme est enregistré !`, cls: 'checkout-log' });
  return true;
}
/* Adversaire du joueur solo selon le choix « Adversaire ». */
function makeSoloOpponent(humanName) {
  const choice = (document.getElementById('cfgOpponent') || { value: 'bot' }).value;
  if (choice === 'twin') {
    const avg = careerAvgOf(humanName);
    if (avg) { STATE.botAvg = clampBotAvg(avg); return createPlayer('🤖 ' + humanName + ' (double)', true); }
    showToast('Pas encore assez de parties pour créer votre double : DartBot à la place', 'error');
  }
  if (choice === 'ghost' && isX01Mode()) {
    const g = ghostOf(humanName, ghostKey());
    if (g) { const p = createPlayer('👻 ' + humanName + ' (record ' + g.darts + ' fl.)', true); p.ghost = true; p.ghostVisits = g.visits; return p; }
    showToast('Pas encore de record sur ce mode : jouez et gagnez une partie pour créer votre fantôme', 'error');
  }
  return createPlayer('🤖 DartBot', true);
}
/* Fléchette suivante du fantôme (manque si sa partie est épuisée). */
function ghostDart(player) {
  const v = (player.ghostVisits || [])[player.turns] || [];
  const d = v[STATE.dartsThisTurn.length];
  return d ? Object.assign({}, d) : { baseValue: 0, value: 0, label: 'Manqué', mult: 1 };
}
