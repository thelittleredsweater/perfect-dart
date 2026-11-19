'use strict';
/* ============================================================
   Soirée : handicap automatique (X01) et tournoi local.
   - Handicap : chaque joueur part d'un score proportionnel à sa moyenne
     de carrière (le meilleur part du score plein) -> parties équilibrées.
   - Tournoi : poule (tous contre tous) ou élimination directe, matchs
     joués avec le mode/règles de l'écran principal, classement et tableau
     mis à jour automatiquement à la fin de chaque match. Sauvegardé.
   ============================================================ */
const TOURNEY_KEY = 'perfectdarts_tournament_v1';

/* ---------- handicap ---------- */
function applyHandicap() {
  STATE.handicap = false;
  const on = !!(document.getElementById('cfgHandicap') || {}).checked;
  if (!on || !isX01Mode() || STATE.players.length < 2) return;
  const avgs = STATE.players.map(p => (p.isBot ? (p.ghost ? 0 : STATE.botAvg) : careerAvgOf(p.name)));
  const known = avgs.filter(a => a > 0);
  if (known.length < 2) { showToast('Handicap : il faut l’historique d’au moins 2 joueurs', 'error'); return; }
  const mean = known.reduce((s, a) => s + a, 0) / known.length, best = Math.max.apply(null, known);
  STATE.players.forEach((p, i) => {
    const a = avgs[i] || mean;
    const start = Math.max(Math.round(STATE.mode * 0.4), Math.round(STATE.mode * a / best));
    p.start = start; p.score = start; p.scoreHistory = [start];
  });
  STATE.handicap = true;
  STATE.log.unshift({ msg: '⚖️ Handicap : ' + STATE.players.map(p => `${p.name} ${p.start}`).join(' · '), cls: 'highlight' });
}

/* ---------- stockage ---------- */
function loadTourney() { try { return JSON.parse(localStorage.getItem(TOURNEY_KEY)) || null; } catch (e) { return null; } }
function saveTourney(t) { try { if (t) localStorage.setItem(TOURNEY_KEY, JSON.stringify(t)); else localStorage.removeItem(TOURNEY_KEY); } catch (e) {} }

/* ---------- création ---------- */
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function createTourney(names, format, cfg) {
  names = names.map(s => String(s).trim()).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
  if (names.length < 3) return null;
  const t = { id: Date.now(), format, cfg, players: names, matches: [], champion: null, created: new Date().toISOString() };
  if (format === 'ko') {
    let size = 2; while (size < names.length) size *= 2;
    const seeds = shuffled(names); while (seeds.length < size) seeds.push(null);
    /* Exempts répartis : un joueur par paire au maximum. */
    const pairs = []; for (let i = 0; i < size / 2; i++) pairs.push([seeds[i], seeds[size - 1 - i]]);
    pairs.forEach((pr, i) => t.matches.push({ id: 'r1m' + i, round: 1, a: pr[0], b: pr[1], winner: null }));
    resolveByes(t); advanceKo(t);
  } else {
    /* Méthode du cercle : chaque joueur joue une fois par journée. */
    const list = names.slice(); if (list.length % 2) list.push(null);
    const n = list.length;
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a && b) t.matches.push({ id: 'j' + (r + 1) + 'm' + i, round: r + 1, a: r % 2 ? b : a, b: r % 2 ? a : b, winner: null });
      }
      list.splice(1, 0, list.pop());
    }
  }
  return t;
}
function resolveByes(t) { t.matches.forEach(m => { if (!m.winner && m.round && ((m.a && !m.b) || (!m.a && m.b))) { m.winner = m.a || m.b; m.bye = true; } }); }
/* Élimination : crée le tour suivant quand le précédent est complet. */
function advanceKo(t) {
  for (;;) {
    const last = Math.max.apply(null, t.matches.map(m => m.round));
    const cur = t.matches.filter(m => m.round === last);
    if (cur.some(m => !m.winner)) return;
    if (cur.length === 1) { t.champion = cur[0].winner; return; }
    for (let i = 0; i < cur.length; i += 2) t.matches.push({ id: 'r' + (last + 1) + 'm' + i / 2, round: last + 1, a: cur[i].winner, b: cur[i + 1].winner, winner: null });
    resolveByes(t);
  }
}
function nextMatch(t) { return t && !t.champion ? t.matches.find(m => !m.winner && m.a && m.b) || null : null; }
function standings(t) {
  const rows = {}; t.players.forEach(n => { rows[n] = { name: n, p: 0, w: 0, l: 0, lf: 0, la: 0, avgSum: 0, avgN: 0 }; });
  t.matches.filter(m => m.winner && !m.bye).forEach(m => {
    [['a', 'b'], ['b', 'a']].forEach(([x, y]) => {
      const r = rows[m[x]]; if (!r) return;
      r.p++; if (m.winner === m[x]) r.w++; else r.l++;
      r.lf += m['legs' + x.toUpperCase()] || 0; r.la += m['legs' + y.toUpperCase()] || 0;
      if (m['avg' + x.toUpperCase()]) { r.avgSum += m['avg' + x.toUpperCase()]; r.avgN++; }
    });
  });
  return Object.values(rows).map(r => Object.assign(r, { pts: 2 * r.w, diff: r.lf - r.la, avg: r.avgN ? Math.round(r.avgSum / r.avgN) : 0 }))
    .sort((a, b) => b.pts - a.pts || b.diff - a.diff || b.avg - a.avg);
}

/* ---------- jeu ---------- */
function setupValue(id, v) { const el = document.getElementById(id); if (el && v != null) { if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v); } }
function playTourneyMatch(id) {
  const t = loadTourney(); if (!t || t.champion) return;
  const m = id ? t.matches.find(x => x.id === id && !x.winner && x.a && x.b) : nextMatch(t);
  if (!m) return;
  setupValue('cfgMode', t.cfg.mode); setupValue('cfgFinish', t.cfg.finish); setupValue('cfgLegs', t.cfg.legs);
  setupValue('cfgSets', t.cfg.sets); setupValue('cfgDoubleIn', t.cfg.doubleIn); setupValue('cfgHandicap', t.cfg.handicap);
  startGame([m.a, m.b], { tournamentMatch: m.id });
}
/* Appelé par endGame : enregistre le résultat du match de tournoi. */
function tournamentRecordResult(winner) {
  const t = loadTourney(); if (!t) return;
  const m = t.matches.find(x => x.id === STATE.tournamentMatch); if (!m || m.winner) return;
  const pa = STATE.players.find(p => p.name === m.a), pb = STATE.players.find(p => p.name === m.b);
  m.winner = winner.name;
  const fmt = typeof isMatchFormat === 'function' && isMatchFormat();
  m.legsA = fmt ? (pa && pa.legsTotal) || 0 : (winner.name === m.a ? 1 : 0);
  m.legsB = fmt ? (pb && pb.legsTotal) || 0 : (winner.name === m.b ? 1 : 0);
  if (pa) m.avgA = matchSummary(pa).avg; if (pb) m.avgB = matchSummary(pb).avg;
  m.played = new Date().toISOString();
  if (t.format === 'ko') advanceKo(t);
  else if (!nextMatch(t)) t.champion = standings(t)[0].name;
  saveTourney(t);
}

/* ---------- écran ---------- */
const TN_MODES = [['501', '501'], ['301', '301'], ['701', '701'], ['cricket', 'Cricket'], ['shanghai', 'Shanghai']];
/* Brouillon de création (joueurs, format, règles) conservé tant que l'écran est ouvert. */
let tnDraft = null;
function tnDraftInit() {
  if (tnDraft) return tnDraft;
  const v = id => (document.getElementById(id) || {}).value;
  const names = []; for (let i = 1; i <= PLAYER_COUNT; i++) { const el = document.getElementById('playerName' + i); const n = el && el.value.trim(); if (n && !names.includes(n)) names.push(n); }
  const mode = TN_MODES.some(m => m[0] === v('cfgMode')) ? v('cfgMode') : '501';
  tnDraft = { names, format: 'league', cfg: { mode, finish: v('cfgFinish') || 'double', legs: v('cfgLegs') || '1', sets: '1', doubleIn: !!(document.getElementById('cfgDoubleIn') || {}).checked, handicap: false } };
  return tnDraft;
}
function cfgSnapshot() { return Object.assign({}, tnDraftInit().cfg); }
function cfgLabel(c) {
  const m = isNaN(c.mode) ? c.mode : parseInt(c.mode, 10);
  let s = fmtMode(m);
  if (typeof m === 'number') { s += c.finish === 'double' ? ' double out' : ' simple'; if (+c.legs > 1) s += ' · BO' + c.legs + ' legs'; if (+c.sets > 1) s += ' · ' + c.sets + ' sets'; if (c.handicap) s += ' · handicap'; }
  else if (+c.legs > 1) s += ' · BO' + c.legs;
  return s;
}
function openTournament() { tnDraft = null; renderTournament(); showScreen('screenTournament'); }
function tnInitials(n) { const w = String(n || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0][1] || ''))).toUpperCase(); }
function tnAvatar(n, cls) { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `<span class="tn-av${cls ? ' ' + cls : ''}" style="--h:${h}">${escapeHtml(tnInitials(n))}</span>`; }
function tnMatchCount(n, f) { return f === 'ko' ? Math.max(0, n - 1) : n * (n - 1) / 2; }

function renderTournament() {
  const body = document.getElementById('tnBody'); if (!body) return;
  const t = loadTourney();
  if (!t) { renderTournamentSetup(body); return; }
  renderTournamentRun(body, t);
}
function renderTournamentSetup(body) {
  const d = tnDraftInit(), esc = escapeHtml, n = d.names.length;
  let known = []; try { const c = loadCareer(); known = Object.keys(c.profiles).filter(k => !d.names.includes(k) && !(typeof isBotName === 'function' && isBotName(c, k))).sort((x, y) => c.profiles[y].games - c.profiles[x].games).slice(0, 12); } catch (e) {}
  const x01 = !isNaN(d.cfg.mode);
  const seg = (key, val, opts) => `<div class="sd-seg tn-seg">${opts.map(([v, l]) => `<button type="button" class="${String(val) === String(v) ? 'on' : ''}" onclick="tnSet('${key}','${v}')">${l}</button>`).join('')}</div>`;
  body.innerHTML = `
  <div class="card tn-card">
    <div class="tn-step"><span>1</span>Joueurs <small>${n} / 3 minimum</small></div>
    <div class="tn-plist">${d.names.map((nm, i) => `<div class="tn-pchip">${tnAvatar(nm)}<span>${esc(nm)}</span><button type="button" aria-label="Retirer ${esc(nm)}" onclick="tnRemove(${i})">✕</button></div>`).join('') || '<div class="empty-note" style="padding:6px 0">Ajoute au moins 3 joueurs.</div>'}</div>
    <div class="tn-add"><input id="tnNewName" type="text" maxlength="20" placeholder="Nom du joueur" enterkeyhint="done" onkeydown="if(event.key==='Enter'){event.preventDefault();tnAdd()}"><button type="button" class="btn btn-primary btn-sm" onclick="tnAdd()">＋ Ajouter</button></div>
    ${known.length ? `<div class="tn-known"><div class="label">Joueurs connus</div>${known.map(k => `<button type="button" class="sd-chip" data-n="${esc(k)}" onclick="tnAdd(this.dataset.n)">＋ ${esc(k)}</button>`).join('')}</div>` : ''}
  </div>
  <div class="card tn-card">
    <div class="tn-step"><span>2</span>Format</div>
    <div class="tn-formats">
      <button type="button" class="tn-fmt${d.format === 'league' ? ' on' : ''}" onclick="tnSet('format','league')"><b>🔄 Poule</b><span>Tous contre tous. Victoire = 2 pts, départage aux legs puis à la moyenne.</span><em>${n >= 2 ? tnMatchCount(n, 'league') + ' matchs' : '—'}</em></button>
      <button type="button" class="tn-fmt${d.format === 'ko' ? ' on' : ''}" onclick="tnSet('format','ko')"><b>⚔️ Élimination</b><span>Tableau tiré au sort, le perdant sort. Exempts automatiques.</span><em>${n >= 2 ? tnMatchCount(n, 'ko') + ' matchs' : '—'}</em></button>
    </div>
  </div>
  <div class="card tn-card">
    <div class="tn-step"><span>3</span>Règles des matchs</div>
    <div class="label">Jeu</div>${seg('mode', d.cfg.mode, TN_MODES)}
    ${x01 ? `<div class="label">Fin</div>${seg('finish', d.cfg.finish, [['double', 'Double out'], ['straight', 'Simple']])}` : ''}
    <div class="label">Manches</div>${seg('legs', d.cfg.legs, [['1', '1 leg'], ['3', 'BO 3'], ['5', 'BO 5'], ['7', 'BO 7']])}
    ${x01 ? `<label class="tn-check"><input type="checkbox" ${d.cfg.handicap ? 'checked' : ''} onchange="tnSet('handicap',this.checked)"> ⚖️ Handicap selon la moyenne de chacun</label>` : ''}
  </div>
  <div class="tn-cta"><button class="btn btn-primary" ${n < 3 ? 'disabled' : ''} onclick="startTournamentFromForm()">🏆 Lancer le tournoi${n >= 3 ? ' · ' + n + ' joueurs' : ''}</button></div>`;
}
function tnSet(k, v) { const d = tnDraftInit(); if (k === 'format') d.format = v; else d.cfg[k] = v; renderTournament(); }
function tnAdd(name) {
  const d = tnDraftInit(), el = document.getElementById('tnNewName');
  const n = String(name != null ? name : (el && el.value) || '').trim().slice(0, 20);
  if (!n) { if (el) el.focus(); return; }
  if (d.names.some(x => x.toLowerCase() === n.toLowerCase())) { showToast('Déjà dans la liste', 'error'); return; }
  if (d.names.length >= 16) { showToast('16 joueurs maximum', 'error'); return; }
  d.names.push(n); renderTournament();
  const ni = document.getElementById('tnNewName'); if (ni && name == null) try { ni.focus(); } catch (e) {}
}
function tnRemove(i) { tnDraftInit().names.splice(i, 1); renderTournament(); }
function startTournamentFromForm() {
  const d = tnDraftInit();
  const t = createTourney(d.names, d.format, Object.assign({}, d.cfg));
  if (!t) { showToast('Il faut au moins 3 joueurs différents', 'error'); return; }
  saveTourney(t); tnDraft = null; renderTournament(); showToast('Tournoi créé : ' + t.players.length + ' joueurs', 'success');
}

function tnRoundName(t, rounds, r) {
  if (t.format !== 'ko') return 'Journée ' + r;
  const n = rounds[r].length; return n === 1 ? 'Finale' : n === 2 ? 'Demi-finales' : n === 4 ? 'Quarts de finale' : n === 8 ? 'Huitièmes' : 'Tour ' + r;
}
function tnScore(m, side) { if (!m.winner || m.bye) return ''; const l = m['legs' + side]; return l != null ? `<b class="tn-sc">${l}</b>` : ''; }
function tnMatchRow(t, m, nm) {
  const esc = escapeHtml, st = n => (m.winner ? (m.winner === n ? ' w' : ' l') : '');
  const name = (n, side) => `<span class="tn-side${st(n)}">${n ? tnAvatar(n, 'sm') + '<span class="tn-n">' + esc(n) + '</span>' : '<i>exempt</i>'}${tnScore(m, side)}</span>`;
  const playable = !m.winner && m.a && m.b && !t.champion;
  const tail = m.bye ? '<span class="tn-tag">qualifié</span>' : playable ? `<button type="button" class="tn-play${m === nm ? ' next' : ''}" onclick="playTourneyMatch('${m.id}')">▶ Jouer</button>` : m.winner && m.avgA != null ? `<span class="tn-avg">moy. ${m.avgA} · ${m.avgB}</span>` : !m.winner ? '<span class="tn-tag">en attente</span>' : '';
  return `<div class="tn-match${m === nm ? ' next' : ''}${m.winner ? ' done' : ''}">${name(m.a, 'A')}${name(m.b, 'B')}<div class="tn-tail">${tail}</div></div>`;
}
function tnBracket(t, rounds, nm) {
  const keys = Object.keys(rounds).sort((a, b) => a - b);
  /* Tours pas encore créés (élimination) : cases vides pour montrer tout le chemin. */
  let size = rounds[keys[0]].length; const all = keys.slice(); let r = +keys[keys.length - 1];
  for (let left = rounds[keys[keys.length - 1]].length; left > 1; left /= 2) all.push(String(++r));
  const esc = escapeHtml;
  const cell = (m, side) => { const n = m && m[side === 'A' ? 'a' : 'b']; const cls = m && m.winner && !m.bye ? (m.winner === n ? ' w' : ' l') : ''; return `<div class="br-p${cls}">${n ? esc(n) : m && m.bye ? '<i>exempt</i>' : '<i>à venir</i>'}${m && !m.virt ? tnScore(m, side) : ''}</div>`; };
  /* Tours à venir : on place déjà les qualifiés connus (vainqueurs du tour précédent). */
  const cols = []; all.forEach((k, i) => { if (rounds[k]) { cols.push(rounds[k]); return; } const prev = cols[i - 1] || [];
    cols.push(Array.from({ length: Math.max(1, Math.ceil(prev.length / 2)) }, (_, j) => ({ virt: true, a: prev[2 * j] && prev[2 * j].winner || null, b: prev[2 * j + 1] && prev[2 * j + 1].winner || null, winner: null }))); });
  return `<div class="bracket">${all.map((k, i) => { const list = cols[i];
    const label = rounds[k] ? tnRoundName(t, rounds, k) : (list.length === 1 ? 'Finale' : list.length === 2 ? 'Demi-finales' : list.length === 4 ? 'Quarts de finale' : 'Tour ' + k);
    return `<div class="br-col"><div class="br-h">${label}</div><div class="br-list">${list.map(m => `<div class="br-m${m === nm ? ' next' : ''}${m.bye ? ' bye' : ''}"${!m.virt && !m.winner && m.a && m.b && !t.champion ? ` onclick="playTourneyMatch('${m.id}')"` : ''}>${cell(m, 'A')}${cell(m, 'B')}</div>`).join('')}</div></div>`; }).join('')}
    <div class="br-col br-champ"><div class="br-h">Champion</div><div class="br-list"><div class="br-m"><div class="br-p${t.champion ? ' w' : ''}">${t.champion ? '🏆 ' + esc(t.champion) : '<i>?</i>'}</div></div></div></div></div>`;
}
function renderTournamentRun(body, t) {
  const nm = nextMatch(t), esc = escapeHtml;
  const played = t.matches.filter(m => m.winner && !m.bye).length, total = t.format === 'ko' ? t.players.length - 1 : t.matches.length;
  const rounds = {}; t.matches.forEach(m => { (rounds[m.round] = rounds[m.round] || []).push(m); });
  const st = t.format !== 'ko' ? standings(t) : null;
  let hero;
  if (t.champion) {
    const podium = st ? st.slice(0, 3).map(r => r.name) : (() => { const fin = t.matches.filter(m => m.round === Math.max(...t.matches.map(x => x.round)))[0]; return [t.champion, fin && (fin.a === t.champion ? fin.b : fin.a)].filter(Boolean); })();
    hero = `<div class="card tn-hero champ"><div class="tn-trophy">🏆</div><div class="tn-champ-name">${esc(t.champion)}</div><div class="tn-champ-sub">remporte le tournoi</div>
      <div class="tn-podium">${podium.map((n, i) => `<div class="pd pd${i + 1}">${tnAvatar(n)}<b>${esc(n)}</b><span>${['🥇', '🥈', '🥉'][i]}</span></div>`).join('')}</div>
      <div class="tn-hero-actions"><button class="btn btn-primary" onclick="tnRestart()">🔁 Revanche (mêmes joueurs)</button></div></div>`;
  } else if (nm) {
    const rn = tnRoundName(t, rounds, nm.round);
    hero = `<div class="card tn-hero"><div class="tn-hero-lab">Prochain match · ${esc(rn)}</div>
      <div class="tn-vs">${tnAvatar(nm.a, 'lg')}<div class="tn-vsn">${esc(nm.a)}</div><div class="tn-x">VS</div><div class="tn-vsn">${esc(nm.b)}</div>${tnAvatar(nm.b, 'lg')}</div>
      <button class="btn btn-primary tn-go" onclick="playTourneyMatch('${nm.id}')">▶ Jouer ce match</button></div>`;
  } else hero = '';
  const prog = `<div class="tn-prog"><div class="tn-prog-top"><span>${t.format === 'ko' ? '⚔️ Élimination' : '🔄 Poule'} · ${esc(cfgLabel(t.cfg))}</span><b>${played}/${total} matchs</b></div><div class="tn-bar"><i style="width:${total ? 100 * played / total : 0}%"></i></div></div>`;
  let left = '', right = '';
  if (st) {
    left = `<div class="card card-scroll"><div class="chart-title">Classement</div><table class="stats-table tn-table"><thead><tr><th>#</th><th>Joueur</th><th>J</th><th>V</th><th>D</th><th>Legs</th><th>Moy</th><th>Pts</th></tr></thead><tbody>`
      + st.map((r, i) => `<tr class="${i === 0 && r.p ? 'lead' : ''}${t.champion && i === 0 ? ' tn-win' : ''}"><td>${i < 3 && r.p ? ['🥇', '🥈', '🥉'][i] : i + 1}</td><td><span class="tn-tn">${tnAvatar(r.name, 'sm')}${esc(r.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td>${r.avg || '—'}</td><td><b class="tn-pts">${r.pts}</b></td></tr>`).join('')
      + '</tbody></table></div>';
    right = `<div class="card"><div class="chart-title">Matchs</div>${Object.keys(rounds).map(r => `<div class="tn-round"><div class="label">${tnRoundName(t, rounds, r)}</div>${rounds[r].map(m => tnMatchRow(t, m, nm)).join('')}</div>`).join('')}</div>`;
  } else {
    left = `<div class="card tn-br-card"><div class="chart-title">Tableau</div>${tnBracket(t, rounds, nm)}</div>`;
    right = `<div class="card"><div class="chart-title">Matchs</div>${Object.keys(rounds).map(r => `<div class="tn-round"><div class="label">${tnRoundName(t, rounds, r)}</div>${rounds[r].map(m => tnMatchRow(t, m, nm)).join('')}</div>`).join('')}</div>`;
  }
  body.innerHTML = hero + prog + `<div class="tn-cols${st ? '' : ' ko'}"><div>${left}</div><div>${right}</div></div>`
    + '<button class="btn btn-ghost btn-sm tn-end" onclick="endTournament()">🗑️ Terminer et effacer le tournoi</button>';
}
function tnRestart() { const t = loadTourney(); if (!t) return; const n = createTourney(t.players, t.format, t.cfg); if (n) { saveTourney(n); renderTournament(); showToast('Nouveau tournoi lancé', 'success'); } }
function endTournament() {
  const go = () => { saveTourney(null); tnDraft = null; renderTournament(); };
  if (typeof askConfirm === 'function') askConfirm('Terminer et effacer le tournoi en cours ?', 'Effacer', 'Annuler', ok => { if (ok) go(); });
  else if (confirm('Terminer et effacer le tournoi en cours ?')) go();
}
