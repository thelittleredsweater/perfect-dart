'use strict';
/* MARATHON — simulations statistiques et invariants. node tests/marathon.cjs
  charge le vrai code du jeu avec des timers executes en boucle synchrone
 (pump) : des milliers de parties bot-vs-bot par niveau. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JS_DIR = path.join(__dirname, '..', 'js');

function createEnv(cfgValues = {}) {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const elements = new Map();
  function makeEl(id) {
    const listeners = {};
    const el = {
      id, value: '', textContent: '', _html: '', style: {}, dataset: {}, children: [],
      classList: {
        _s: new Set(),
        add(...c) { c.forEach(x => this._s.add(x)); },
        remove(...c) { c.forEach(x => this._s.delete(x)); },
        toggle(c) { if (this._s.has(c)) this._s.delete(c); else this._s.add(c); return this._s.has(c); },
        contains(c) { return this._s.has(c); },
      },
      addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
      fire(t) { (listeners[t] || []).forEach(f => f({ target: el })); },
      setAttribute() {}, appendChild(c) { this.children.push(c); return c; }, remove() {},
      querySelectorAll() { return []; }, scrollLeft: 0,
      scrollTo() {}, offsetLeft: 0, offsetWidth: 0, clientWidth: 100,
      getContext() { return { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {}, lineWidth: 0, strokeStyle: '', fillStyle: '', font: '', textAlign: '' }; },
    };
    Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; } });
    return el;
  }
  const document = {
    getElementById: id => { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); },
    createElement: () => makeEl(''),
    querySelectorAll: () => [], querySelector: () => null,
    body: makeEl('body'), addEventListener() {},
  };
  Object.keys(cfgValues).forEach(k => { document.getElementById(k).value = cfgValues[k]; });
  return { document, localStorage, store, elements, elFor: id => document.getElementById(id) };
}

/* Chargeur avec timers fictifs : setTimeout met en file, pump() deroule tout. */
function loadFast(env) {
  const ctx = { ...env, navigator: { vibrate: () => {} }, console, Date, JSON, window: null, scrollTo: () => {}, WebSocket: undefined, confirm: () => true, alert: () => {}, location: { protocol: 'file:', host: '' } };
  let pend = [];
  ctx.__pumped = 0;
  ctx.setTimeout = f => { pend.push(f); return pend.length; };
  ctx.clearTimeout = () => {};
  ctx.$pump = (limit) => {
    let guard = 0;
    const before = ctx.__pumped;
    while (pend.length) {
      const f = pend.shift(); guard++;
      ctx.__pumped++;
      if (ctx.__pumped > 5000000) throw new Error('pompe depassee : 5M callbacks');
      f();
      if (typeof limit === 'number' && guard >= limit) break;
    }
    return ctx.__pumped - before;
  };
  ctx.Math = Object.create(Math);
  ctx.window = ctx;
  vm.createContext(ctx);
  ['config.js', 'sounds.js', 'net.js', 'voice.js', 'stats.js', 'dartboard.js', 'game.js', 'bot2.js', 'ui.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), ctx, { filename: f });
  });
  ['playEvent', 'announceCheckout', 'announceBust', 'recordGameToCareer', 'initVoice', 'pickVoice', 'showToast'].forEach(fn => {
    if (typeof ctx[fn] !== 'function') ctx[fn] = () => {};
  });
  if (ctx.voiceSynth == null) ctx.voiceSynth = null;
  ctx.voiceLang = 'off';
  vm.runInContext('this.__STATE = STATE; this.__CHECKOUTS = CHECKOUTS;', ctx);
  return {
    ctx, S: () => ctx.__STATE, exec: c => vm.runInContext(c, ctx), pump: ctx.$pump,
  };
}

/* Ticks d'assertion : invariants apres chaque volée. */
const INV = { checked: 0, bad: [] };
function checkInvariants(t, tag) {
  const s = t.S();
  INV.checked++;
  const isPractice = typeof s.mode === 'string'; /* bobs27/catch40/highscore : score negatif legitime (penalites) */
  const ok =
    s.players.every(p => Number.isFinite(p.score) && (p.score >= 0 || (isPractice && p.score > -1000))) &&
    s.players.every(p => !(!Number.isFinite(p.score) || !Number.isFinite(p.turns))) &&
    s.dartsThisTurn.length <= 3 &&
    s.currentPlayer >= 0 && s.currentPlayer < s.players.length &&
    !s.players.some(p => Array.isArray(p.turnHistory) && p.turnHistory.some(v => !Number.isFinite(v) || v < -60));
  if (!ok) INV.bad.push(tag + ' ' + JSON.stringify(s.players.map(p => ({ n: p.name, s: p.score, t: p.turns, isB: p.isBot }))));
}

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const round1 = x => Math.round(10 * x) / 10;

function simX01(level, legs) {
  const t = loadFast(createEnv({ cfgMode: '501', cfgFinish: 'double', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + level + ';maybeBotTurn()');
  const totals = []; let legsDone = 0; let stalls = 0; const dartsPerLeg = []; let busts = 0, visits = 0, first9 = [];
  while (legsDone < legs) {
    const moved = t.pump();
    checkInvariants(t, 'x01@' + level);
    const s = t.S();
    if (s.gameOver) {
      legsDone++;
      totals.push(...s.players[1].turnHistory);
      dartsPerLeg.push(s.players[1].dartsThrown);
      busts += s.players[1].busts; visits += s.players[1].turns;
      first9.push(s.players[1].first9 || 0);
      if (legsDone < legs) t.exec('startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + level + ';maybeBotTurn()');
    } else if (moved === 0) {
      stalls++;
      if (stalls > 5) throw new Error('partie bloquee @' + level + ' : ' + JSON.stringify(s.players.map(p => ({ s: p.score, t: p.turns, b: p.isBot }))) + ' cur=' + s.currentPlayer + ' log=' + s.log.slice(0, 2).join(' // '));
    } else stalls = 0;
  }
  return { avg3: mean(totals), dartsPerLeg: mean(dartsPerLeg), bustRate: visits ? busts / visits : 0, n: totals.length, winShare: null };
}

/* ---------------- B. Cricket bot-vs-bot ---------------- */
function simCricket(level, games) {
  const t = loadFast(createEnv({ cfgMode: 'cricket', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + level + ';maybeBotTurn()');
  let done = 0; const mprs = []; const visitsToWin = [];
  while (done < games) {
    t.pump();
    checkInvariants(t, 'cricket@' + level);
    const s = t.S();
    if (s.gameOver) {
      done++;
      const w = s.players.find(p => p.mpr != null && p.mpr > 0) || s.players[1];
      mprs.push(s.players[1].mpr || 0);
      visitsToWin.push(s.players[1].turns);
      if (done < games) t.exec('startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + level + ';maybeBotTurn()');
    } else t.pump();
  }
  return { mpr: mean(mprs), visits: mean(visitsToWin), n: done };
}

/* ---------------- C. Around bot-vs-bot (simples) ---------------- */
function simAround(level, games, variant) {
  const t = loadFast(createEnv({ cfgMode: 'around', cfgAround: String(variant), cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec(`PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=${level};maybeBotTurn()`);
  let done = 0; const vis = [];
  while (done < games) {
    t.pump();
    checkInvariants(t, 'around@' + level);
    const s = t.S();
    if (s.gameOver) {
      done++;
      vis.push(s.players[1].turns);
      if (done < games) t.exec(`startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=${level};maybeBotTurn()`);
    } else t.pump();
  }
  return { visits: mean(vis), n: done };
}

/* ---------------- D. Modes solo : parcours complets ---------------- */
function soloBobs(level) {
  const t = loadFast(createEnv({ cfgMode: 'bobs27', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; checkInvariants(t, 'bobs27'); }
  checkInvariants(t, 'bobs27');
  return t.S();
}
function soloCatch(level) {
  const t = loadFast(createEnv({ cfgMode: 'catch40', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; checkInvariants(t, 'catch40'); }
  checkInvariants(t, 'catch40');
  return t.S();
}
function soloHigh(level) {
  const t = loadFast(createEnv({ cfgMode: 'highscore', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; checkInvariants(t, 'highscore'); }
  checkInvariants(t, 'highscore');
  return t.S();
}

if (require.main === module) {
  (async () => {
    const L = Number(process.env.MARATHON_LEGS || 300);
    console.log('== CALIBRATION BOT X01 (double out, bot vs bot, ' + L + ' jambes par niveau) ==');
    console.log('niveau | moy/3 realizes | darts/leg | busts | ecart');
    for (const lvl of [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) {
      const r = simX01(lvl, L);
      console.log(String(lvl).padStart(5), '|', round1(r.avg3).toString().padStart(8), '|', round1(r.dartsPerLeg).toString().padStart(7), '|', (100 * r.bustRate).toFixed(1) + '%', '|', (r.avg3 - lvl >= 0 ? '+' : '') + round1(r.avg3 - lvl));
    }
    console.log('\n== CRICKET bot vs bot (60 parties/niveau) ==');
    for (const lvl of [20, 60, 120]) {
      const r = simCricket(lvl, 60);
      console.log(String(lvl).padStart(5), '| MPR', round1(r.mpr), '| volees pour finir', round1(r.visits), '| n=' + r.n);
    }
    console.log('\n== AROUND bot vs bot (simples, 40 parties/niveau) ==');
    for (const lvl of [20, 60, 120]) {
      const r = simAround(lvl, 40, 1);
      console.log(String(lvl).padStart(5), '| volees pour finir', round1(r.visits));
    }
    console.log('\n== SOLO : parcours complets ==');
    const b = soloBobs(60); console.log('bobs27 : fini=', b.gameOver, ' score=', b.players[0].score, ' tours=', b.players[0].turns, ' bobsRound=', b.bobsRound);
    const c = soloCatch(60); console.log('catch40: fini=', c.gameOver, ' score=', c.players[0].score, ' vies=', c.lives, ' tours=', c.players[0].turns);
    const h = soloHigh(60); console.log('highsc.: fini=', h.gameOver, ' score=', h.players[0].score, ' tours=', h.players[0].turns);
    console.log('\nINVARIANTS :', INV.checked, 'etats verifiees,', INV.bad.length, 'violations');
    if (INV.bad.length) console.log(INV.bad.slice(0, 5).join('\n'));
  })().catch(e => { console.error('ERR ' + e.stack); process.exit(1); });
}
module.exports = { createEnv, loadFast, simX01, simCricket, simAround, round1, mean, INV, checkInvariants };