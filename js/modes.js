'use strict';
/* ============================================================
   Modes supplémentaires : Shanghai, Killer (multijoueur, bot
   possible), 121 et Doubles aléatoires (entraînement solo).
   Chargé après game.js et bot2.js : branché par applyVisitResult,
   maybeBotTurn, renderHUD, hudTurnLabel, rulesForMode.
   État propre au mode : STATE.ms (sauvegardé et annulable).
   ============================================================ */

const EXTRA_MODES = ['shanghai', 'killer', 'co121', 'doubles'];

/* ---------- initialisation (appelée par startGame) ---------- */
function initModeState() {
  STATE.ms = {};
  if (STATE.mode === 'killer') {
    /* Numéros tirés au sort, tous différents. */
    const nums = []; for (let n = 1; n <= 20; n++) nums.push(n);
    for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
    STATE.players.forEach((p, i) => { p.kNum = nums[i]; p.lives = KILLER_LIVES; p.isKiller = false; p.score = KILLER_LIVES; });
  }
  if (STATE.mode === 'co121') {
    STATE.ms = { target: CO121_START, visit: 0, attempt: 1, best: 0, success: 0 };
    STATE.players.forEach(p => { p.score = CO121_START; p.scoreHistory = [CO121_START]; });
  }
  if (STATE.mode === 'doubles') {
    const pool = []; for (let n = 1; n <= 20; n++) pool.push(n); pool.push(25);
    const targets = [];
    while (targets.length < DOUBLES_ROUNDS) { const t = pool[Math.floor(Math.random() * pool.length)]; if (targets[targets.length - 1] !== t) targets.push(t); }
    STATE.ms = { targets, idx: 0, hits: 0 };
  }
}
const dblName = t => (t === 25 ? 'D-Bull' : 'D' + t);

/* ---------- Shanghai ---------- */
/* Manche r (1..7) : seul le numéro r compte (simple r, double 2r, triple 3r).
   Simple + double + triple du numéro dans la même volée = « Shanghai » : victoire
   immédiate. Sinon, après la 7e manche, le plus gros total gagne. */
function applyShanghaiResult(player) {
  const target = player.turns + 1, darts = STATE.dartsThisTurn;
  let pts = 0; const mults = new Set();
  darts.forEach(d => { if (d.baseValue === target) { pts += d.value; mults.add(d.mult); } });
  player.turns++; player.dartsThrown += darts.length; player.score += pts; player.totalScored += pts;
  if (pts > player.bestTurn) player.bestTurn = pts;
  player.turnHistory.push(pts); player.scoreHistory.push(player.score);
  if (mults.has(1) && mults.has(2) && mults.has(3)) {
    STATE.log.unshift({ msg: `🀄 SHANGHAI ${player.name} sur le ${target} !`, cls: 'checkout-log' });
    endGame(player); return true;
  }
  STATE.log.unshift({ msg: `${player.name} · ${target} : +${pts} (total ${player.score})`, cls: pts >= 3 * target ? 'highlight' : '' });
  announceVisitScore(pts);
  if (STATE.currentPlayer === STATE.players.length - 1 && player.turns >= SHANGHAI_ROUNDS) {
    let best = STATE.players[0]; STATE.players.forEach(p => { if (p.score > best.score) best = p; });
    endGame(best); return true;
  }
  return false;
}

/* ---------- Killer ---------- */
/* Chaque joueur a un numéro. Toucher le DOUBLE de son numéro fait de lui un
   « killer » ; un killer qui touche le double d'un adversaire lui retire une vie.
   Plus de vies : éliminé. Le dernier en vie gagne. */
function killerAlive() { return STATE.players.filter(p => p.lives > 0); }
function applyKillerResult(player) {
  const darts = STATE.dartsThisTurn;
  player.turns++; player.dartsThrown += darts.length;
  const events = [];
  darts.forEach(d => {
    if (d.mult !== 2) return;
    if (d.baseValue === player.kNum) {
      if (!player.isKiller) { player.isKiller = true; events.push('devient KILLER 🔪'); }
      return;
    }
    if (!player.isKiller) return;
    const victim = STATE.players.find(p => p !== player && p.kNum === d.baseValue && p.lives > 0);
    if (!victim) return;
    victim.lives--; victim.score = victim.lives;
    player.totalScored++; player.bestTurn = Math.max(player.bestTurn, 1);
    events.push(victim.lives > 0 ? `touche ${victim.name} (${victim.lives} ♥)` : `élimine ${victim.name} ☠`);
  });
  player.turnHistory.push(events.length);
  STATE.log.unshift({ msg: `${player.name} : ${darts.map(d => d.label).join(' + ')}${events.length ? ' → ' + events.join(', ') : ''}`, cls: events.length ? 'highlight' : '' });
  const alive = killerAlive();
  if (alive.length <= 1) { endGame(alive[0] || player); return true; }
  return false;
}
/* Saute les joueurs éliminés (appelé après le changement de joueur). */
function skipInactive() {
  if (STATE.mode !== 'killer' || !killerAlive().length) return;
  let guard = STATE.players.length;
  while (STATE.players[STATE.currentPlayer].lives <= 0 && guard-- > 0) STATE.currentPlayer = (STATE.currentPlayer + 1) % STATE.players.length;
}

/* ---------- 121 (entraînement au checkout) ---------- */
/* 10 essais : finir le score cible (départ 121) en 3 volées maximum, en double.
   Réussi : la cible monte de 1. Raté : on rejoue la même cible. */
function co121Remaining() { const p = STATE.players[STATE.currentPlayer]; return p ? p.score - STATE.dartsThisTurn.reduce((s, d) => s + d.value, 0) : 0; }
function applyCo121Result(player) {
  const ms = STATE.ms, darts = STATE.dartsThisTurn, total = darts.reduce((s, d) => s + d.value, 0);
  player.turns++; player.dartsThrown += darts.length;
  { let rem = player.score; for (const d of darts) { if (rem === 50 || (rem >= 2 && rem <= 40 && rem % 2 === 0)) { const seg = rem === 50 ? 25 : rem / 2; player.doublesAttempted++; if (d.mult === 2 && d.baseValue === seg) player.doublesHit++; recordDoubleAttempt(player, seg, d.mult === 2 && d.baseValue === seg); } rem -= d.value; if (rem <= 1) break; } }
  const ns = player.score - total, last = darts[darts.length - 1];
  const ok = ns === 0 && last && last.mult === 2;
  const bust = !ok && (ns < 2);
  if (!bust && !ok) { player.score = ns; player.totalScored += total; }
  if (ok) player.totalScored += total;
  if (bust) { player.busts++; announceBust(); }
  ms.visit++;
  if (ok || ms.visit >= CO121_VISITS) {
    if (ok) {
      ms.success++; ms.best = Math.max(ms.best, ms.target); player.checkouts++;
      STATE.log.unshift({ msg: `✅ ${ms.target} fini en ${ms.visit} volée${ms.visit > 1 ? 's' : ''} !`, cls: 'checkout-log' });
      announceCheckout(); ms.target++;
    } else STATE.log.unshift({ msg: `❌ ${ms.target} non fini`, cls: 'bust-log' });
    ms.attempt++; ms.visit = 0;
    if (ms.attempt > CO121_ATTEMPTS) {
      endPractice(player, ms.success > 0, `${ms.success}/${CO121_ATTEMPTS} finishs · record ${ms.best || '—'}`);
      return true;
    }
    player.score = ms.target; player.scoreHistory.push(ms.target);
  } else if (!bust) {
    STATE.log.unshift({ msg: `${ms.target} · volée ${ms.visit} : ${total} → reste ${player.score}`, cls: '' });
  }
  return false;
}

/* ---------- Doubles aléatoires ---------- */
/* 20 volées, chacune sur un double tiré au sort (Bull compris). On compte les
   doubles touchés sur 60 fléchettes. */
function applyDoublesResult(player) {
  const ms = STATE.ms, t = ms.targets[ms.idx], darts = STATE.dartsThisTurn;
  const hits = darts.filter(d => d.mult === 2 && d.baseValue === t).length;
  darts.forEach(d => recordDoubleAttempt(player, t, d.mult === 2 && d.baseValue === t));
  ms.hits += hits; player.score = ms.hits;
  player.turns++; player.dartsThrown += darts.length;
  player.doublesAttempted += darts.length; player.doublesHit += hits;
  player.turnHistory.push(hits); player.scoreHistory.push(ms.hits);
  STATE.log.unshift({ msg: `${dblName(t)} : ${hits ? hits + ' touché' + (hits > 1 ? 's' : '') : 'raté'}`, cls: hits ? 'highlight' : '' });
  ms.idx++;
  if (ms.idx >= DOUBLES_ROUNDS) {
    const n = DOUBLES_ROUNDS * 3, pct = Math.round(100 * ms.hits / n);
    endPractice(player, pct >= 15, `${ms.hits} doubles sur ${n} fléchettes (${pct} %)`);
    return true;
  }
  return false;
}

/* ---------- bot ---------- */
function botShanghaiDart(avg) {
  const p = STATE.players[STATE.currentPlayer], t = p.turns + 1;
  const got = new Set(STATE.dartsThisTurn.filter(d => d.baseValue === t).map(d => d.mult));
  const tok = !got.has(3) ? 'T' + t : !got.has(2) ? 'D' + t : 'S' + t;
  return b2Dart(tok, b2SigmaOf(avg));
}
function botKillerDart(avg) {
  const me = STATE.players[STATE.currentPlayer];
  let num = me.kNum;
  if (me.isKiller) {
    const opp = STATE.players.filter(p => p !== me && p.lives > 0).sort((a, b) => a.lives - b.lives)[0];
    if (opp) num = opp.kNum;
  }
  return b2Dart('D' + num, b2SigmaOf(avg));
}

/* ---------- affichage ---------- */
function modeScoreDisplay(p, i) {
  if (STATE.mode === 'killer') return `${p.lives > 0 ? '♥'.repeat(p.lives) : '☠'} · ${p.kNum}${p.isKiller ? ' 🔪' : ''}`;
  if (STATE.mode === 'doubles') return `${p.score} ✓`;
  return null;
}
function modeTurnLabel(p) {
  const ms = STATE.ms || {};
  if (STATE.mode === 'shanghai') return `Shanghai · ${p.name} · cible ${Math.min(p.turns + 1, SHANGHAI_ROUNDS)} (${Math.min(p.turns + 1, SHANGHAI_ROUNDS)}/${SHANGHAI_ROUNDS})`;
  if (STATE.mode === 'killer') return `${p.name} · vise ${p.isKiller ? 'les doubles adverses 🔪' : 'D' + p.kNum}`;
  if (STATE.mode === 'co121') return `121 · cible ${ms.target} · essai ${ms.attempt}/${CO121_ATTEMPTS} · volée ${(ms.visit || 0) + 1}/${CO121_VISITS}`;
  if (STATE.mode === 'doubles' && ms.targets) return `Visez ${dblName(ms.targets[ms.idx])} · ${ms.idx + 1}/${DOUBLES_ROUNDS}`;
  return null;
}
function modeRules(mode) {
  if (mode === 'shanghai') return [
    `${SHANGHAI_ROUNDS} manches : à la manche 1 seul le 1 compte, à la manche 2 le 2, etc. Simple = numéro, double = ×2, triple = ×3.`,
    'SHANGHAI : simple + double + triple du numéro dans la même volée = victoire immédiate.',
    `Sinon, le plus gros total après ${SHANGHAI_ROUNDS} manches gagne. En solo, un bot vous affronte.`,
  ];
  if (mode === 'killer') return [
    `Chaque joueur reçoit un numéro au hasard et ${KILLER_LIVES} vies. Touchez le DOUBLE de votre numéro pour devenir « killer » 🔪.`,
    'Killer : chaque double touché sur le numéro d’un adversaire lui retire une vie. Plus de vie : éliminé.',
    'Le dernier joueur en vie gagne. Saisie : ×2 puis le numéro. En solo, un bot vous affronte.',
  ];
  if (mode === 'co121') return [
    `Solo — entraînement au checkout. Finissez ${CO121_START} en ${CO121_VISITS} volées maximum (dernière fléchette en double).`,
    'Réussi : la cible monte de 1 (122, 123…). Raté : même cible à l’essai suivant. Bust : la volée ne compte pas.',
    `${CO121_ATTEMPTS} essais. Le checkout suggéré s’affiche à chaque volée.`,
  ];
  if (mode === 'doubles') return [
    `Solo — ${DOUBLES_ROUNDS} volées de 3 fléchettes, chacune sur un double tiré au sort (Bull compris).`,
    'Seul le double annoncé compte. Le score final est le nombre de doubles touchés et votre pourcentage.',
  ];
  return null;
}
