'use strict';
/* Batterie de tests Perfect Dart — executer avec : node tests/dart-tests.cjs
   Charge le vrai code du jeu (js/*.js) dans un DOM simule et verifie les
   comportements cles de tous les modes : 501/301/701, cricket, around,
   bot, sauvegarde/reprise, reglages, statistiques, table checkouts, reseau. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const JS_DIR = path.join(__dirname, '..', 'js');

/* ---------------- DOM simule ---------------- */
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
      id, value: '', textContent: '', _html: '',
      style: {}, dataset: {}, children: [],
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
      querySelectorAll() { return []; },
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

function loadGame(env) {
  const ctx = { ...env, navigator: { vibrate: () => {} }, console, setTimeout, clearTimeout, Math: null, Date, JSON, window: null, scrollTo: () => {}, WebSocket: undefined, confirm: () => true, alert: () => {}, location: { protocol: 'file:', host: '' } };
  // Math pilotable : ctx.__forceRandom force la valeur de Math.random (tests deterministes du bot)
  ctx.Math = Object.create(Math);
  ctx.Math.random = () => (ctx.__forceRandom !== undefined && ctx.__forceRandom !== null ? ctx.__forceRandom : Math.random());
  ctx.window = ctx;
  vm.createContext(ctx);
  ['config.js', 'sounds.js', 'net.js', 'voice.js', 'stats.js', 'coach.js', 'dartboard.js', 'game.js', 'bot2.js', 'modes.js', 'tournament.js', 'tv.js', 'ui.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), ctx, { filename: f });
  });
  ['playEvent', 'announceCheckout', 'announceBust', 'recordGameToCareer', 'initVoice', 'pickVoice'].forEach(fn => {
    if (typeof ctx[fn] !== 'function') ctx[fn] = () => {};
  });
  if (!ctx.voiceSynth) ctx.voiceSynth = null;
  if (!ctx.voiceLang) ctx.voiceLang = 'off';
  vm.runInContext('this.__STATE = STATE; this.__CHECKOUTS = CHECKOUTS;', ctx);
  // Rythme du bot accelere pour les tests (anciennes valeurs) ; le rythme reel est dans js/config.js.
  vm.runInContext('Object.assign(BOT_DELAYS,{start:500,dart:400,end:500,next:0})', ctx);
  return {
    ctx, S: () => ctx.__STATE, exec: code => vm.runInContext(code, ctx),
    sleep: ms => new Promise(r => setTimeout(r, ms)), store: env.store, elFor: env.elFor,
  };
}

/* ---------------- Mini framework ---------------- */
let passed = 0, failed = 0; const failures = [];
function check(cond, label, extra) {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else { failed++; failures.push(label + (extra ? ' — ' + extra : '')); console.log('  FAULT ' + label + (extra ? ' — ' + extra : '')); }
}

/* Helpers de jeu */
function setupGame({ mode = '501', finish = 'double', bot = '3', players = ['Greg', 'Léo'] } = {}) {
  const cfg = { cfgMode: mode, cfgFinish: finish, cfgBotLevel: bot, cfgVoice: 'off' };
  players.forEach((n, i) => { cfg['playerName' + (i + 1)] = n; });
  const env = createEnv(cfg);
  const tt = loadGame(env);
  tt.exec('PLAYER_COUNT=' + players.length);
  tt.exec('startGame()');
  return tt;
}
/* Positionne le joueur actif et remet la volee a zero (apres un endTurn programme). */
function toPlayer(t, i) { t.exec('STATE.currentPlayer=' + i + ';STATE.dartsThisTurn=[]'); }
async function throwVisit(t, darts) {
  for (const d of darts) t.exec('throwDart(' + d[0] + ',' + d[1] + ')');
  await t.sleep(600);
}

/* ---------------- Scenarios ---------------- */
async function tests501Double() {
  console.log('\n== 501 double out ==');
  { // Victoire avec double + stats
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    check(t.S().players[0].score === 321, 'T20x3 compte', 'score=' + t.S().players[0].score);
    check(t.S().players[0].count180 === 1, '180 comptabilise');
    check(t.S().currentPlayer === 1, 'tour suivant');
    await throwVisit(t, [[0, 1], [0, 1], [0, 1]]);
    check(t.S().players[1].score === 501, '3 manques laissent le score', 'score=' + t.S().players[1].score);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=40');
    await throwVisit(t, [[20, 2]]);
    check(t.S().gameOver === true, 'checkout D20 a 40 restant termine la partie', 'gameOver=' + t.S().gameOver);
    const p = t.S().players[0];
    check(p.checkouts === 1 && p.doublesHit === 1 && p.doublesAttempted === 1, 'stats checkout/doubles', JSON.stringify({ c: p.checkouts, dh: p.doublesHit, da: p.doublesAttempted }));
  }
  { // Busts
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 1);
    t.exec('STATE.players[1].score=50');
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]); // -130
    check(t.S().players[1].score === 50 && t.S().players[1].busts === 1, 'bust negatif : score intact', JSON.stringify({ s: t.S().players[1].score, b: t.S().players[1].busts }));
    toPlayer(t, 1);
    t.exec('STATE.players[1].score=40');
    await throwVisit(t, [[15, 3], [0, 1], [0, 1]]); // 45 -> negatif
    check(t.S().players[1].score === 40 && t.S().players[1].busts === 2, 'bust negatif cumule', JSON.stringify({ s: t.S().players[1].score, b: t.S().players[1].busts }));
  }
  { // Bust sur reste 1 en double out
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=41');
    await throwVisit(t, [[20, 2]]); // 80 -> reste 1 : bust
    check(t.S().players[0].score === 41 && t.S().players[0].busts === 1, 'bust sur reste 1 en double out', JSON.stringify({ s: t.S().players[0].score, b: t.S().players[0].busts }));
  }
  { // Checkout auto des la 1re flechette (regression)
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=50');
    t.exec('throwDart(25,2)'); // DBull des la 1re flechette
    await t.sleep(600);
    check(t.S().gameOver === true, 'checkout DBull a 50 des la 1re flechette', 'gameOver=' + t.S().gameOver);
  }
  { // Fin sur D1 depuis 2
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=2');
    await throwVisit(t, [[1, 2]]);
    check(t.S().gameOver === true, 'fin sur D1 depuis 2', 'gameOver=' + t.S().gameOver);
  }
  { // Quick scores
    const t = setupGame({});
    toPlayer(t, 0);
    t.exec('quickScore(180)');
    await t.sleep(500);
    check(t.S().players[0].score === 321 && t.S().players[0].count180 === 1, 'quickScore 180', JSON.stringify({ s: t.S().players[0].score, c: t.S().players[0].count180 }));
    toPlayer(t, 0);
    t.exec('quickScore(26)');
    await t.sleep(500);
    check(t.S().players[0].score === 295, 'quickScore 26', 'score=' + t.S().players[0].score);
    toPlayer(t, 0);
    t.exec('quickScore(60)');
    await t.sleep(50);
    t.exec('quickScore(100)'); // doit etre refuse pendant la volee
    await t.sleep(500);
    check(t.S().players[0].score === 235, 'quickScore refuse pendant volee (60 passe, 100 non)', 'score=' + t.S().players[0].score);
  }
  { // Undo et passer
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    check(t.S().players[0].score === 321, 'base avant undo');
    t.exec('undoLast()');
    check(t.S().players[0].score === 501 && t.S().currentPlayer === 0, 'undo reprend le tour', 'score=' + t.S().players[0].score + ' cP=' + t.S().currentPlayer);
    // v1.5.2 : undo flechette par flechette -> la volee rouverte garde ses 2 premieres flechettes
    check(t.S().dartsThisTurn.length === 2, 'undo apres volee : une seule flechette retiree', 'n=' + t.S().dartsThisTurn.length);
    t.exec('undoLast()'); t.exec('undoLast()');
    check(t.S().dartsThisTurn.length === 0 && t.S().players[0].score === 501, 'undo successifs vident la volee');
    t.exec('skipTurn()');
    await t.sleep(700);
    check(t.S().currentPlayer === 1 && t.S().players[0].score === 501, 'passer saute le tour avec manque');
    t.exec('undoLast()');
    check(t.S().currentPlayer === 0, 'undo apres passer');
  }
  { // Trop de flechettes ignore
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.dartsThisTurn=[{baseValue:20,value:60,label:"T20",mult:3},{baseValue:20,value:60,label:"T20",mult:3},{baseValue:20,value:60,label:"T20",mult:3}]');
    const scoreBefore = t.S().players[0].score;
    t.exec('throwDart(20,3)');
    check(t.S().dartsThisTurn.length === 3, '4e flechette d une volee pleine ignoree', 'len=' + t.S().dartsThisTurn.length);
    t.exec('endTurn()');
    await t.sleep(600);
    check(t.S().players[0].score === scoreBefore - 180, 'volee pleine soldee via endTurn', 'score=' + t.S().players[0].score);
  }
}

async function tests501Straight() {
  console.log('\n== 501 straight out ==');
  const t = setupGame({ finish: 'straight' });
  check(t.S().finishDouble === false, 'mode straight actif');
  await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
  check(t.S().players[0].score === 321, 'base');
  toPlayer(t, 0);
  t.exec('STATE.players[0].score=60');
  await throwVisit(t, [[20, 3]]);
  check(t.S().gameOver === true, 'fin sur T20 a 60 restant (straight)', 'gameOver=' + t.S().gameOver);
  // reste 1 : pas de bust en straight (regression)
  const t3 = setupGame({ finish: 'straight' });
  await throwVisit(t3, [[20, 3], [20, 3], [20, 3]]);
  toPlayer(t3, 0);
  t3.exec('STATE.players[0].score=2');
  await throwVisit(t3, [[1, 1]]); // reste 1 : pas de cloture, pas de bust
  check(t3.S().players[0].score === 2 && t3.S().dartsThisTurn.length === 1 && t3.S().players[0].busts === 0, 'reste 1 tolere en straight (pas de bust, tour en cours)', JSON.stringify({ s: t3.S().players[0].score, d: t3.S().dartsThisTurn.length, b: t3.S().players[0].busts }));
  await throwVisit(t3, [[1, 1]]); // fin sur 1
  check(t3.S().gameOver === true && t3.S().players[0].checkouts === 1, 'fin sur 1 simple en straight', 'gameOver=' + t3.S().gameOver);
  // bust si negatif en straight
  const t4 = setupGame({ finish: 'straight' });
  await throwVisit(t4, [[20, 3], [20, 3], [20, 3]]);
  toPlayer(t4, 0);
  t4.exec('STATE.players[0].score=1');
  await throwVisit(t4, [[20, 3]]);
  check(t4.S().players[0].score === 1 && t4.S().players[0].busts === 1, 'straight : bust si negatif', JSON.stringify({ s: t4.S().players[0].score, b: t4.S().players[0].busts }));
}

async function testsModes() {
  console.log('\n== 301 / 701 ==');
  for (const m of ['301', '701']) {
    const t = setupGame({ mode: m });
    check(t.S().mode === parseInt(m, 10) && t.S().players[0].score === parseInt(m, 10), 'depart ' + m);
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    check(t.S().players[0].score === parseInt(m, 10) - 180, m + ' : volée 180 comptée', 'score=' + t.S().players[0].score);
  }
  console.log('\n== Cricket ==');
  {
    const t = setupGame({ mode: 'cricket', players: ['A', 'B'] });
    check(Object.keys(t.S().cricketMarks[0]).length === 7, '7 marques de depart');
    // A ferme 20 avec des simples sur 3 tours (? non : 3 darts simples dans une volee)
    await throwVisit(t, [[20, 1], [20, 1], [20, 1]]);
    check(t.S().cricketMarks[0][20] === 3, '20 ferme apres 3 marquages', 'marks=' + t.S().cricketMarks[0][20]);
    check(t.S().players[0].score === 0, 'aucun point (B n a pas 20 ferme? si: surplus)', 'score=' + t.S().players[0].score);
    // A ferme 19 aussi
    toPlayer(t, 0);
    await throwVisit(t, [[19, 1], [19, 1], [19, 1]]);
    check(t.S().cricketMarks[0][19] === 3, '19 ferme');
    check(t.S().players[0].score === 0, '19 ferme sans surplus (B ouvert mais 0 sur-marque)', 'score=' + t.S().players[0].score);
    // Sur-marque sur 20 : B ouvert -> points
    toPlayer(t, 0);
    await throwVisit(t, [[20, 1], [0, 1], [0, 1]]);
    check(t.S().players[0].score === 20, 'surplus sur 20 compte quand B ouvert', 'score=' + t.S().players[0].score);
    // B ferme 20, A sur-marque encore : plus aucun point
    t.exec('STATE.cricketMarks[1][20]=3');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 1], [0, 1], [0, 1]]);
    check(t.S().players[0].score === 20, '20 ferme par les deux : aucun point', 'score=' + t.S().players[0].score);
    check(t.S().gameOver === false, 'cricket non termine');
    // Victoire : tout ferme + meilleur score
    ['19', '18', '17', '16', '15', '25'].forEach(n => { t.exec('STATE.cricketMarks[0][' + n + ']=3'); });
    toPlayer(t, 0);
    t.exec('STATE.dartsThisTurn=[{baseValue:15,value:15,label:"15",mult:1}]');
    t.exec('endTurn()');
    check(t.S().gameOver === true, '7 chiffres fermes + meilleur score -> victoire', 'gameOver=' + t.S().gameOver);
  }
  console.log('\n== Around the Clock ==');
  {
    const t = setupGame({ mode: 'around', players: ['A', 'B'] });
    check(t.S().aroundClock[0] === 1, 'cible 1 au depart');
    await throwVisit(t, [[1, 1], [0, 1], [0, 1]]);
    check(t.S().aroundClock[0] === 2, 'cible 1 touchee -> 2', 'cible=' + t.S().aroundClock[0]);
    toPlayer(t, 0);
    await throwVisit(t, [[5, 1], [0, 1], [0, 1]]);
    check(t.S().aroundClock[0] === 2, 'cible 2 ratee (5) : reste sur 2', 'cible=' + t.S().aroundClock[0]);
    t.exec('STATE.aroundClock[0]=20');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 1], [0, 1], [0, 1]]);
    check(t.S().gameOver === false && t.S().aroundClock[0] === 21, '20 touche -> passage au BULL (pas encore gagne)', 'cible=' + t.S().aroundClock[0]);
    toPlayer(t, 0);
    await throwVisit(t, [[25, 1]]);
    check(t.S().gameOver === true, 'BULL touche -> victoire', 'gameOver=' + t.S().gameOver);
    const t2 = setupGame({ mode: 'around', players: ['A', 'B'] });
    await throwVisit(t2, [[1, 1], [2, 1], [3, 1]]);
    check(t2.S().aroundClock[0] === 4, 'volee 1-2-3 -> cible 4', 'cible=' + t2.S().aroundClock[0]);
  }
}

async function testsBot() {
  console.log('\n== Bot (solo, moyenne 20-120) ==');
  for (const lvl of ['20', '90']) {
    const t = setupGame({ mode: '301', bot: lvl, players: ['Greg'] });
    check(t.S().players.length === 2 && t.S().players[1].isBot === true, 'bot ' + lvl + ' : present');
    check(t.S().players[1].name.startsWith('🤖'), 'nom du bot');
    check(t.S().botAvg === parseInt(lvl, 10), 'bot ' + lvl + ' : moyenne appliquee');
    let stall = false, prevHuman = -1, sameCount = 0;
    for (let i = 0; i < 60 && !t.S().gameOver; i++) {
      await t.sleep(900);
      if (!t.S().gameOver && t.S().currentPlayer === 0 && !t.S().isBotTurn && t.S().dartsThisTurn.length < 3) {
        const rem = t.S().players[0].score;
        const dn = t.S().dartsThisTurn.length;
        /* 301 = 3xT20 ; 121 = T20 + 1 + D20 (reste 20) ; 20 = D10 fin */
        const plan = rem === 301 ? ['throwDart(20,3)', 'throwDart(20,3)', 'throwDart(20,3)']
          : rem === 121 ? ['throwDart(20,3)', 'throwDart(1,1)', 'throwDart(20,2)']
          : rem === 20 ? ['throwDart(10,2)']
          : ['throwDart(20,3)'];
        t.exec(plan[Math.min(dn, plan.length - 1)]);
        await t.sleep(500);
      }
      if (t.S().currentPlayer === 0 && !t.S().isBotTurn) {
        if (t.S().players[0].score === prevHuman) sameCount++; else { sameCount = 0; prevHuman = t.S().players[0].score; }
        if (sameCount > 6) { stall = true; break; }
      }
    }
    check(t.S().gameOver === true, 'bot ' + lvl + ' : le jeu se termine (le joueur finit)', 'bloque a ' + prevHuman + ' / gameOver=' + t.S().gameOver);
    check(t.S().players[0].score <= t.S().mode, 'bot ' + lvl + ' : score du joueur 1 decremente', 'score=' + t.S().players[0].score);
  }
  { // le bot doit savoir terminer : score ramene a 32, double out (bot2 : sigma force a 10mm, fin en 1-2 visites)
    const t = setupGame({ mode: '301', bot: '75', players: ['Greg'] });
    t.exec('BOT2_SIGMA_OVERRIDE=10'); // bot precis mais realiste : ~80% de chance de finir par visite
    await t.sleep(800);
    for (let i = 0; i < 25 && !t.S().gameOver; i++) {
      await t.sleep(900);
      if (t.S().gameOver) break;
      if (process.env.DBG32) console.log('v' + i + ' scoreAvantReset=' + t.S().players[1].score + ' cur=' + t.S().currentPlayer + ' botTurn=' + t.S().isBotTurn + ' darts=' + t.S().dartsThisTurn.length + ' over=' + t.S().gameOver + ' busts=' + t.S().players[1].busts + ' labels=' + JSON.stringify((t.S().dartsThisTurn||[]).map(d=>d.label)));
      t.exec('STATE.players[1].score=32'); // le bot rejoue toujours depuis 32
      if (t.S().currentPlayer === 0 && !t.S().isBotTurn && t.S().dartsThisTurn.length < 3) { t.exec('throwDart(20,3)'); await t.sleep(400); }
    }
    check(t.S().gameOver === true, 'le bot termine depuis 32 (double out)', 'gameOver=' + t.S().gameOver + ' scoreBot=' + t.S().players[1].score + ' busts=' + t.S().players[1].busts);
    check(t.S().players[1].checkouts >= 1, 'checkout credite au bot', t.S().players[1].checkouts + '');
  }
  { // bot a 10 : il fini sur D5 ou patiente sans gel (pas de fin erronee, pas de blocage isBotTurn)
    const t = setupGame({ mode: '301', bot: '90', players: ['Greg'] });
    await t.sleep(800);
    let gel = 0, endedBadly = false;
    for (let i = 0; i < 20; i++) {
      await t.sleep(900);
      if (t.S().gameOver) { if (t.S().players[1].checkouts < 1) endedBadly = true; break; }
      t.exec('STATE.players[1].score=10');
      if (t.S().currentPlayer === 0 && !t.S().isBotTurn && t.S().dartsThisTurn.length < 3) { t.exec('throwDart(20,3)'); await t.sleep(400); }
      if (t.S().isBotTurn) gel++; else gel = 0;
      if (gel > 8) break;
    }
    check(!endedBadly && gel <= 8, 'bot a 10 : ni fin erronee ni blocage', 'endedBadly=' + endedBadly + ' gel=' + gel);
  }
}

async function testsPersistence() {
  console.log('\n== Sauvegarde / reprise ==');
  { // roundtrip
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    const save = JSON.parse(t.store.get('perfectdarts_save_v1'));
    check(save.players[0].score === 321 && save.mode === 501, 'sauvegarde apres tour', JSON.stringify({ s: save.players[0].score, m: save.mode }));
    const t2 = loadGame(createEnv());
    t2.store.set('perfectdarts_save_v1', t.store.get('perfectdarts_save_v1'));
    t2.exec('resumeSavedGame()');
    check(t2.S().players[0].score === 321, 'reprise retrouve le score', 'score=' + t2.S().players[0].score);
    check(t2.S().players.length === 2 && t2.S().players[0].name === 'Greg', 'noms retablis');
  }
  { // reprise volee pleine (regression du bug fige)
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    const raw = t.store.get('perfectdarts_save_v1');
    const t2 = loadGame(createEnv());
    // sauvegarde corrompue volontairement : volee pleine en cours
    const save = JSON.parse(raw);
    save.dartsThisTurn = [{ baseValue: 20, value: 60, label: 'T20', mult: 3 }, { baseValue: 20, value: 60, label: 'T20', mult: 3 }, { baseValue: 20, value: 60, label: 'T20', mult: 3 }];
    save.currentPlayer = 0;
    t2.store.set('perfectdarts_save_v1', JSON.stringify(save));
    t2.exec('resumeSavedGame()');
    await t2.sleep(600);
    check(t2.S().players[0].score === 321 - 180 && t2.S().dartsThisTurn.length === 0, 'reprise avec volee pleine : tour solde', JSON.stringify({ s: t2.S().players[0].score, d: t2.S().dartsThisTurn.length }));
  }
  { // reprise avec volee partielle
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    const t2 = loadGame(createEnv());
    const save = JSON.parse(t.store.get('perfectdarts_save_v1'));
    save.dartsThisTurn = [{ baseValue: 20, value: 40, label: 'D20', mult: 2 }];
    save.currentPlayer = 0;
    t2.store.set('perfectdarts_save_v1', JSON.stringify(save));
    t2.exec('resumeSavedGame()');
    await t2.sleep(600);
    t2.exec('throwDart(0,1)'); // interaction toujours possible
    await t2.sleep(600);
    check(t2.S().dartsThisTurn.length === 2, 'reprise avec volee partielle : volee completable', 'en attente=' + t2.S().dartsThisTurn.length);
  }
  { // reprise Bob's 27 : score de depart 27 etTour conserve
    const t = loadGame(createEnv({ cfgMode: 'bobs27' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    toPlayer(t, 0);
    await throwVisit(t, [[1, 2], [1, 2], [1, 2]]);
    const t2 = loadGame(createEnv({ cfgMode: 'bobs27' }));
    const save = JSON.parse(t.store.get('perfectdarts_save_v1'));
    save.dartsThisTurn = [];
    t2.store.set('perfectdarts_save_v1', JSON.stringify(save));
    t2.exec('resumeSavedGame()');
    await t2.sleep(600);
    check(t2.S().players[0].score === 33 && t2.S().bobsRound === 2, "reprise Bob's 27 : score 33 et tour 2", JSON.stringify({ s: t2.S().players[0].score, r: t2.S().bobsRound }));
  }
  { // sauvegarde corrompue
    const t = loadGame(createEnv());
    t.store.set('perfectdarts_save_v1', '{nope');
    let crashed = false;
    try { t.exec('updateResumeBtn()'); } catch (e) { crashed = true; }
    await t.sleep(100);
    check(!crashed, 'sauvegarde corrompue : aucun crash');
  }
  { // sauvegarde d'une partie terminee : pas de reprise
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=40');
    await throwVisit(t, [[20, 2]]);
    const save = JSON.parse(t.store.get('perfectdarts_save_v1'));
    check(save.gameOver === true, 'partie terminee sauvegardee comme terminee');
    const t2 = loadGame(createEnv());
    t2.exec('resumeSavedGame()');
    check(t2.S().gameOver === false && t2.S().players.length === 0, 'partie terminee non reprise (etat vierge)', 'players=' + t2.S().players.length);
  }
}

async function testsSettings() {
  console.log('\n== Reglages ==');
  { // reglages corrompus
    const t = loadGame(createEnv());
    t.store.set('perfectdarts_settings_v1', '{{{pas du json');
    let ok = true;
    try { t.exec('loadSettings()'); t.exec('openSettings()'); } catch (e) { ok = false; console.log('   err=' + e.message); }
    check(ok, 'reglages corrompus : aucun crash');
    check(t.exec('SETTINGS.inputMethod') === 'pad', 'valeurs par defaut retablies', String(t.exec('SETTINGS.inputMethod')));
  }
  { // nombre de joueurs
    const t = loadGame(createEnv());
    t.exec('PLAYER_COUNT=6');
    t.exec('changePlayerCount(1)');
    check(t.exec('PLAYER_COUNT') === 6, 'plafond 6 joueurs');
    t.exec('PLAYER_COUNT=1');
    t.exec('changePlayerCount(-1)');
    check(t.exec('PLAYER_COUNT') === 1, 'plancher 1 joueur');
  }
  { // noms vides
    const t = setupGame({ players: ['', ''] });
    check(t.S().players[0].name === 'Joueur 1' && t.S().players[1].name === 'Joueur 2', 'noms vides -> Joueur 1/2', JSON.stringify(t.S().players.map(p => p.name)));
  }
  { // XSS via nom de joueur
    const t = setupGame({ players: ['<img src=x onerror=alert(1)>', 'Bob'] });
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    const hud = t.elFor('hudScores').innerHTML;
    check(!hud.includes('<img'), 'nom malveillant neutralise dans le HUD', hud.slice(0, 80));
    check(!t.elFor('logPanel').innerHTML.includes('<img'), 'nom malveillant neutralise dans l historique');
  }
  { // son / voix off
    const t = setupGame({});
    t.exec('SETTINGS.voiceLang="en";SETTINGS.prevVoice="en"');
    t.exec('toggleMute()');
    check(t.exec('SETTINGS.voiceLang') === 'off', 'mute -> voix off');
    t.exec('toggleMute()');
    check(t.exec('SETTINGS.voiceLang') === 'en', 'unmute retabli');
  }
}

async function testsStats() {
  console.log('\n== Statistiques ==');
  { // enregistrement de partie + reset
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=40');
    await throwVisit(t, [[20, 2]]);
    const career = t.store.get('perfectdarts_career_v1');
    const prof = career && JSON.parse(career).profiles && JSON.parse(career).profiles['Greg'];
    check(!!prof && prof.games === 1, 'partie terminee enregistree', career ? career.slice(0, 120) : String(!!career));
    { const cj = JSON.parse(career); const st = cj.history[0].players[0].st || {};
      check(st.dt === 4 && st.sc === 220 && st.hiCo === 40 && st.bl === 4 && st.bk[0] === 1 && st.bk[4] === 1, 'v1.7 stats : detail de partie (darts, score, checkout, meilleur leg, repartition)', JSON.stringify(st));
      check(!!(cj.hits && cj.hits.Greg && cj.hits.Greg[20][2] === 3 && cj.hits.Greg[20][1] === 1), 'v1.7 stats : impacts par segment pour la heatmap', JSON.stringify(cj.hits));
      t.exec('renderStatsScreen()');
      const dash = t.elFor('statsPlayer').innerHTML;
      check(dash.indexOf('Moyenne 3 fl.') >= 0 && dash.indexOf('Records') >= 0 && dash.indexOf('Heatmap') >= 0, 'v1.7 stats : tableau de bord joueur (KPI, records, heatmap)'); }
    let ok = true;
    try { t.exec('renderStatsScreen()'); t.exec('resetCareer()'); } catch (e) { ok = false; console.log('   err=' + e.message); }
    check(ok, 'ecran stats + remise a zero sans crash');
    check(!t.store.get('perfectdarts_career_v1'), 'carriere effacee');
  }
  { // moyennes et tours records
    const t = setupGame({});
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]); // 180
    toPlayer(t, 0);
    t.exec('STATE.players[0].score=401');
    await throwVisit(t, [[10, 1], [10, 1], [10, 1]]); // 30
    const p = t.S().players[0];
    check(p.bestTurn === 180 && p.turns === 2, 'meilleure volee = 180', JSON.stringify({ best: p.bestTurn, turns: p.turns }));
    check(p.count140 === 1 && p.count100 === 1 && p.count60 === 1, 'paliers 140/100/60', JSON.stringify({ c140: p.count140, c100: p.count100, c60: p.count60 }));
  }
}

async function testsCheckouts() {
  console.log('\n== Table des checkouts ==');
  const impossible = [169, 168, 166, 165, 163, 162, 159];
  const t = loadGame(createEnv());
  let okPresence = true, okExact = true, okBanned = true;
  for (let r = 2; r <= 170; r++) {
    const route = t.exec('__CHECKOUTS[' + r + ']');
    if (impossible.includes(r)) { if (route) { okBanned = false; } continue; }
    if (!route) { okPresence = false; continue; }
    let sum = 0, lastMult = 1;
    for (const dart of route.split(' ')) {
      let mult = 1, base = dart;
      if (dart.startsWith('T')) { mult = 3; base = dart.slice(1); }
      else if (dart.startsWith('D')) { mult = 2; base = dart.slice(1); }
      const b = base === 'Bull' ? 25 : parseInt(base, 10);
      if (!b || b < 1 || (b > 20 && b !== 25)) okExact = false;
      sum += b * mult; lastMult = mult;
    }
    if (sum !== r) { okExact = false; }
    if (lastMult !== 2) { okExact = false; } // derniere flechette toujours un double
  }
  check(okPresence, 'tous les restes possibles 2..170 ont une route');
  check(okBanned, 'restes impossibles (159,162,163,165,166,168,169) exclus');
  check(okExact, 'sommes des routes exactes, fin en double');
  // exemples
  check(t.exec('__CHECKOUTS[170]') === 'T20 T20 DBull', 'route 170');
  check(t.exec('__CHECKOUTS[2]') === 'D1', 'route 2');
}

async function testsNetOffline() {
  console.log('\n== Reseau hors ligne (webview) ==');
  { // adresse serveur (APK) : netUrl et connect
    const t = loadGame(createEnv());
    t.exec('localStorage.setItem(SERVER_KEY,"192.168.1.9:3210")');
    check(t.exec('netUrl()') === 'ws://192.168.1.9:3210/ws', 'netUrl : adresse sauvegardee utilisee', String(t.exec('netUrl()')));
    t.exec('document.getElementById("netServerAddr").value="10.0.0.5:3210"');
    check(t.exec('netUrl()') === 'ws://10.0.0.5:3210/ws', 'netUrl : champ manuel prioritaire', String(t.exec('netUrl()')));
    let okPanel = true;
    try { t.exec('openNetPanel()'); t.exec('netConnect(function(){},function(){},function(){})'); } catch (e) { okPanel = false; }
    check(okPanel, 'panneau en ligne : affichage + connexion sans crash');
  }
  { // pas de serveur : echec propre
    const t = loadGame(createEnv());
    let crashed = false;
    try {
      t.exec('netSend({t:"hello"})');
      t.exec('NET.applyState(null)');
      t.exec('NET.applyState({})');
    } catch (e) { crashed = true; }
    check(!crashed, 'netSend / applyState sans connexion : silencieux');
    const st = t.exec('JSON.stringify({ws:NET.ws, mode:NET.mode})');
    check(st === '{"ws":null,"mode":null}', 'etat reseau propre', st);
  }
  { // netSend sans ws (occurrence double de securite)
    const t = loadGame(createEnv());
    t.exec('netSend({t:"x"})');
    t.exec('NET.applyState(null)');
  }
}

/* ---------------- Voix : fallback Internet (WebView sans speechSynthesis) ---------------- */
async function testsVoiceRemote() {
  console.log('\n== Voix fallback Internet ==');
  function remoteEnv(extraFetch) {
    const env = createEnv();
    const played = [];
    env.Audio = class {
      constructor(src) { this.src = src; }
      play() { played.push(this.src); setTimeout(() => this.onended && this.onended(), 5); return Promise.resolve(); }
      pause() {}
    };
    env.__played = played;
    env.__fetched = [];
    if (extraFetch !== null) env.fetch = url => { env.__fetched.push(url); return extraFetch ? extraFetch(url) : Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ size: 1 }) }); };
    return { env, played, fetched: env.__fetched };
  }
  { // fetch OK : cache blob puis lecture
    const { env, played, fetched } = remoteEnv();
    const t = loadGame(env);
    t.exec('voiceLang="fr"');
    t.exec('speak("Triple vingt")');
    await t.sleep(25);
    check(fetched.length === 1 && /translate_tts/.test(fetched[0]) && /tl=fr/.test(fetched[0]) && fetched[0].includes('Triple%20vingt'), 'TTS distant : URL Google TTS correcte (fr)', String(fetched[0] || fetched.length));
    check(played.length === 1, 'TTS distant : audio joue');
    t.exec('speak("Triple vingt")');
    await t.sleep(400);
    check(fetched.length === 1 && played.length === 2, 'TTS distant : 2e annonce servie depuis le cache', JSON.stringify({ f: fetched.length, p: played.length }));
  }
  { // genre masculin / anglais
    const { env, fetched } = remoteEnv();
    const t = loadGame(env);
    t.exec('voiceLang="en";SETTINGS.voiceGender="male"');
    t.exec('speak("Game shot")');
    await t.sleep(25);
    check(fetched.length === 1 && /translate_tts/.test(fetched[0]) && /tl=en/.test(fetched[0]), 'TTS distant : relais EN', String(fetched[0] || ''));
  }
  { // fetch KO : repli direct sur Audio (pas de CORS)
    const { env, played } = remoteEnv(() => Promise.reject(new Error('cors')));
    const t = loadGame(env);
    t.exec('voiceLang="fr"');
    t.exec('speak("Cent quatre vingt")');
    await t.sleep(25);
    check(played.length === 1 && /translate_tts/.test(played[0]) && played[0].includes('Cent'), 'fetch KO : repli lecture directe', JSON.stringify(played));
  }
  { // voix off : aucun appel reseau
    const { env, played, fetched } = remoteEnv();
    const t = loadGame(env);
    t.exec('voiceLang="off"');
    t.exec('speak("Rien")');
    await t.sleep(25);
    check(fetched.length === 0 && played.length === 0, 'voix off : aucun appel ni lecture');
  }
  { // pas de fetch ni Audio du tout : silencieux sans crash
    const env = createEnv();
    const t = loadGame(env);
    t.exec('voiceLang="fr"');
    let crashed = false;
    try { t.exec('announceDart({baseValue:20,value:60,label:"T20",mult:3})'); t.exec('announceCheckout()'); t.exec('announceBust()'); } catch (e) { crashed = true; console.log('   err=' + e.message); }
    check(!crashed, 'annonces sans Audio ni fetch : silencieux');
    check(t.exec('voiceActive()') === false, 'voiceActive falsifie sans moteur');
  }
  { // avec Audio mais sans fetch, voiceActive vrai
    const { env } = remoteEnv(null);
    const t = loadGame(env);
    t.exec('voiceLang="fr";delete this.fetch');
    check(t.exec('voiceActive()') === true, 'voiceActive avec Audio seul');
  }
  { // priorite : si speechSynthesis present, recourt pas au distant
    const { env, played, fetched } = remoteEnv();
    const spoken = [];
    env.__spoken = spoken;
    const t = loadGame(env);
    t.exec('voiceSynth={speaking:false,pending:false,paused:false,cancel(){},resume(){},speak(u){__spoken.push(u.text)}}');
    t.exec('function SpeechSynthesisUtterance(t){this.text=t;this.lang="";this.voice=null;this.rate=1;this.pitch=1}');
    t.exec('voiceEnabled=true;voiceLang="fr"');
    t.exec('speak("Jeu")');
    await t.sleep(80);
    check(spoken.length === 1 && spoken[0] === 'Jeu', 'synthese locale prioritaire quand disponible', JSON.stringify(spoken));
    check(fetched.length === 0 && played.length === 0, 'aucun appel distant quand synthese locale OK');
  }
}

/* ---------------- v1.5.2 : checkout / undo / retour Android ---------------- */
async function testsV152() {
  console.log('\n== v1.5.2 ==');
  { // 1. route de checkout selon les flechettes restantes
    const t = loadGame(createEnv());
    check(t.exec('checkoutRoute(101,3,true)') === 'T20 9 D16', 'checkout 101 / 3 flechettes');
    check(t.exec('checkoutRoute(101,2,true)') === 'T17 DBull', 'checkout 101 / 2 flechettes', t.exec('checkoutRoute(101,2,true)'));
    check(t.exec('checkoutRoute(101,1,true)') === null, 'checkout 101 / 1 flechette : aucune route');
    check(t.exec('checkoutRoute(40,1,true)') === 'D20' && t.exec('checkoutRoute(50,1,true)') === 'DBull', 'checkout 1 flechette D20 / DBull');
    let bad = 0;
    for (let r = 2; r <= 170; r++) for (let d = 1; d <= 3; d++) {
      const x = t.exec('checkoutRoute(' + r + ',' + d + ',true)'); if (!x) continue;
      const toks = x.split(' '); const v = toks.map(k => k === 'DBull' ? 50 : k === 'Bull' ? 25 : k[0] === 'T' ? 3 * k.slice(1) : k[0] === 'D' ? 2 * k.slice(1) : +k);
      if (v.reduce((a, b) => a + b) !== r || toks.length > d || !/^D/.test(toks[toks.length - 1])) bad++;
    }
    check(bad === 0, 'checkout : toutes les routes sont exactes, finies en double et tiennent dans les flechettes', 'bad=' + bad);
    const g = setupGame({});
    g.exec('STATE.players[0].score=161;STATE.currentPlayer=0;renderCheckout()');
    check(g.elFor('checkoutRoute').textContent === 'T20 T17 DBull', 'affichage 161 avec 3 flechettes');
    g.exec('throwDart(20,3)'); // reste 101, 2 flechettes
    check(g.elFor('checkoutRoute').textContent === 'T17 DBull', 'affichage 101 avec 2 flechettes', g.elFor('checkoutRoute').textContent);
    g.exec('throwDart(20,3)'); // reste 41, 1 flechette -> aucune route
    check(!g.elFor('checkoutBox').classList.contains('active'), 'affichage masque sans route faisable');
    // le bot vise la meme route
    g.exec('STATE.dartsThisTurn=[];BOT2_SIGMA_OVERRIDE=0.01;__forceRandom=0.5');
    const d = g.exec('botDart(101,1,120)');
    check(d.baseValue === 17 && d.mult === 3, 'bot : meme route que l’affichage (101 / 2 fl. -> T17)', JSON.stringify(d));
    g.exec('BOT2_SIGMA_OVERRIDE=0;__forceRandom=null');
  }
  { // 5. undo flechette par flechette, bot saute
    const t = setupGame({ players: ['Greg'], bot: '60' });
    t.exec('PLAYER_COUNT=1');
    const s = t.S;
    t.exec('STATE.players=[STATE.players[0],Object.assign(JSON.parse(JSON.stringify(STATE.players[0])),{name:"Bot",isBot:true})];STATE.currentPlayer=0;STATE.dartsThisTurn=[];STATE.history=[]');
    // volee humaine puis volee bot simulee via endTurn
    t.exec('STATE.dartsThisTurn=[{baseValue:20,value:60,label:"T20",mult:3},{baseValue:19,value:57,label:"T19",mult:3},{baseValue:5,value:5,label:"5",mult:1}];endTurn()');
    t.exec('STATE.currentPlayer=1;STATE.isBotTurn=true;STATE.dartsThisTurn=[{baseValue:20,value:20,label:"20",mult:1}];endTurn();STATE.isBotTurn=false');
    t.exec('gameSession++'); // coupe les timers du bot
    check(s().players[0].score === 379 && s().players[1].score === 481, 'undo : base (humain 122, bot 20)', s().players[0].score + '/' + s().players[1].score);
    t.exec('undoLast()');
    check(s().currentPlayer === 0 && s().players[0].score === 501 && s().players[1].score === 501, 'undo saute la volee du bot');
    check(s().dartsThisTurn.length === 2 && s().dartsThisTurn[1].label === 'T19', 'undo retire seulement la derniere flechette humaine', JSON.stringify(s().dartsThisTurn.map(d => d.label)));
    t.exec('undoLast()');
    check(s().dartsThisTurn.length === 1, 'undo suivant : une flechette de plus');
  }
  { // 5. Bob's 27 / Catch 40 : tour et vies restaures
    const t = loadGame(createEnv({ cfgMode: 'bobs27' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    const r0 = t.exec('STATE.bobsRound'), sc0 = t.S().players[0].score;
    t.exec('STATE.dartsThisTurn=[{baseValue:0,value:0,label:"Manqué",mult:1},{baseValue:0,value:0,label:"Manqué",mult:1},{baseValue:0,value:0,label:"Manqué",mult:1}];endTurn()');
    t.exec('undoLast()');
    check(t.exec('STATE.bobsRound') === r0 && t.S().players[0].score === sc0 && t.S().dartsThisTurn.length === 2, "undo Bob's 27 : tour et score restaures");
    const c = loadGame(createEnv({ cfgMode: 'catch40' }));
    c.exec('PLAYER_COUNT=1;startGame()');
    const l0 = c.exec('STATE.lives');
    c.exec('STATE.dartsThisTurn=[{baseValue:1,value:1,label:"1",mult:1},{baseValue:1,value:1,label:"1",mult:1},{baseValue:1,value:1,label:"1",mult:1}];endTurn()');
    check(c.exec('STATE.lives') === l0 - 1, 'catch40 : vie perdue');
    c.exec('undoLast()');
    check(c.exec('STATE.lives') === l0 && c.S().dartsThisTurn.length === 2, 'undo Catch 40 : vie restauree');
  }
  { // audio : effets et dictee embarquee, fichiers presents
    const t = loadGame(createEnv());
    check(t.exec('soundPath("win")') === 'sounds/flawless-victory_C_major.wav', 'son de victoire');
    t.exec('voiceLang="en"');
    check(t.exec('dartAudioFile({baseValue:20,value:60,label:"T20",mult:3})') === 'sounds/voice/en/f/t20.mp3', 'dictee EN embarquee (voix feminine)');
    t.exec('SETTINGS.voiceGender="male"');
    check(t.exec('dartAudioFile({baseValue:20,value:40,label:"D20",mult:2})') === 'sounds/voice/en/m/d20.mp3', 'dictee EN voix masculine');
    t.exec('SETTINGS.voiceGender="female"');
    const root = path.join(__dirname, '..');
    const missing = [];
    for (const L of ['fr/f', 'fr/m', 'en/f', 'en/m']) {
      for (let n = 1; n <= 20; n++) for (const p of ['n', 'd', 't']) if (!fs.existsSync(path.join(root, 'sounds/voice', L, p + n + '.mp3'))) missing.push(L + '/' + p + n);
      for (const k of ['manque', 'bull', 'double-bull', 'jeu', 'rien']) if (!fs.existsSync(path.join(root, 'sounds/voice', L, k + '.mp3'))) missing.push(L + '/' + k);
    }
    check(missing.length === 0, 'tous les fichiers audio sont presents', missing.join(','));
  }
  { // v1.6 : score restant et marques cricket en direct
    const t = setupGame({});
    t.exec('throwDart(20,3)');
    const card = t.elFor('hudScores').children[0];
    check(card && /441/.test(card.innerHTML) && t.S().players[0].score === 501, 'HUD : restant en direct pendant la volee (441), score reel inchange');
    const c = setupGame({ mode: 'cricket' });
    c.exec('throwDart(20,3)');
    check(/closed/.test(c.elFor('cricketBoard').innerHTML), 'cricket : marques affichees des la flechette');
  }
  { // v1.7 : cible a viser (focus) dans chaque mode
    const J = (t, e) => JSON.stringify(t.exec(e));
    const b = setupGame({ mode: 'bobs27', players: ['Greg'] });
    check(J(b, 'modeFocus().aim') === '[{"b":1,"m":2}]' && J(b, 'modeFocus().live') === '[1]' && b.exec('modeFocus().big') === 'D1', "focus Bob's 27 : D1, seul le 1 est utile");
    const a = setupGame({ mode: 'around', players: ['Greg', 'Léo'] });
    a.exec('throwDart(1,1)');
    check(J(a, 'modeFocus().aim') === '[{"b":2,"m":0}]' && a.exec('modeFocus().big') === '2', 'focus Around : la cible avance pendant la volee (1 -> 2)');
    const k = setupGame({ mode: 'killer', players: ['A', 'B', 'C'] });
    const nums = k.exec('STATE.players.map(p=>p.kNum)');
    check(J(k, 'modeFocus().aim') === JSON.stringify([{ b: nums[0], m: 2 }]), 'focus Killer : non-killer vise son propre double');
    k.exec('STATE.players[0].isKiller=true;STATE.players[2].lives=0');
    check(J(k, 'modeFocus().aim') === JSON.stringify([{ b: nums[1], m: 2 }]), 'focus Killer : killer vise les doubles des adversaires encore en vie');
    const s = setupGame({ mode: 'shanghai', players: ['A', 'B'] });
    s.exec('throwDart(1,3)');
    check(J(s, 'modeFocus().aim.map(x=>x.m)') === '[2,1]', 'focus Shanghai : le triple touche, restent double et simple');
    const x = setupGame({});
    x.exec('STATE.players[0].score=81;renderAll()');
    check(J(x, 'modeFocus().aim') === '[{"b":19,"m":3}]', 'focus X01 : premiere flechette du checkout (T19 pour 81)');
    check(J(x, 'tokAim("DBull")') === '{"b":25,"m":2}' && J(x, 'tokAim("Bull")') === '{"b":25,"m":1}' && J(x, 'tokAim("D16")') === '{"b":16,"m":2}', 'tokAim : Bull / DBull / doubles');
    const c = setupGame({ mode: 'catch40', players: ['Greg'] });
    c.exec('throwDart(20,1)');
    check(c.exec('modeFocus().big') === 'Encore 20', 'focus Catch 40 : points manquants pour atteindre 40');
    const cr = setupGame({ mode: 'cricket' });
    check(cr.exec('modeFocus()') === null, 'focus : le Cricket garde ses propres aides');
    cr.exec('throwDart(20,3)');
    check(cr.exec('crkInfo().state(20)') === 'pts' && cr.exec('crkInfo().livePts') === 0, 'cricket : 20 ferme, adversaire ouvert -> points');
    cr.exec('throwDart(20,2)');
    check(cr.exec('crkInfo().livePts') === 40, 'cricket : points de la volee en direct (+40)');
  }
  { // arbitre : score de volee, restant, reglage
    const played = [];
    const env = createEnv();
    env.Audio = class { constructor(src) { this.src = src; } play() { played.push(this.src); setTimeout(() => this.onended && this.onended(), 2); return Promise.resolve(); } pause() {} };
    const t = loadGame(env);
    t.exec('voiceLang="fr";SETTINGS.caller="visit"');
    t.exec('announceDart({baseValue:20,value:60,label:"T20",mult:3})');
    t.exec('announceVisitScore(140)');
    await t.sleep(40);
    check(played.length === 1 && played[0] === 'sounds/caller/fr/f/140.mp3', 'arbitre (volee seule) : annonce 140 sans dictee', JSON.stringify(played));
    t.exec('announceRemaining(32)');
    await t.sleep(600);
    check(played.slice(1).join() === 'sounds/caller/fr/f/reste.mp3,sounds/caller/fr/f/32.mp3', 'arbitre : « Il vous reste » puis 32 dans l’ordre', JSON.stringify(played));
    t.exec('SETTINGS.caller="darts";announceVisitScore(100)');
    await t.sleep(20);
    check(played.length === 3, 'reglage flechettes seules : pas de score annonce');
    const root = path.join(__dirname, '..'), miss = [];
    for (const L of ['fr/f', 'fr/m', 'en/f', 'en/m']) { for (let n = 1; n <= 180; n++) if (!fs.existsSync(path.join(root, 'sounds/caller', L, n + '.mp3'))) miss.push(L + n); if (!fs.existsSync(path.join(root, 'sounds/caller', L, 'reste.mp3'))) miss.push(L + 'reste'); }
    check(miss.length === 0, 'arbitre : 724 fichiers presents (4 voix)', miss.slice(0, 5).join(','));
  }
  { // legs / sets
    const t = loadGame(createEnv({ cfgMode: '501', cfgFinish: 'double', cfgLegs: '3', cfgSets: '1' }));
    t.exec('PLAYER_COUNT=2;startGame()');
    const winLegBy = async i => { t.exec('STATE.currentPlayer=' + i + ';STATE.dartsThisTurn=[];STATE.players[' + i + '].score=40;throwDart(20,2)'); await t.sleep(600); };
    await winLegBy(0);
    check(t.S().players[0].legs === 1 && !t.S().gameOver && t.S().players.every(p => p.score === 501), 'BO3 : leg 1 gagne, scores remis a 501');
    check(t.S().currentPlayer === 1 && t.S().legStarter === 1, 'BO3 : l’autre joueur commence le leg 2');
    await winLegBy(1);
    check(t.S().players[1].legs === 1 && t.S().legStarter === 0 && !t.S().gameOver, 'BO3 : 1-1, alternance du lanceur');
    await winLegBy(0);
    check(t.S().gameOver && t.S().players[0].legs === 2, 'BO3 : 2-1, match termine');
    const u = loadGame(createEnv({ cfgMode: '501', cfgFinish: 'double', cfgLegs: '3', cfgSets: '1' }));
    u.exec('PLAYER_COUNT=2;startGame();STATE.players[0].score=40;throwDart(20,2)');
    await u.sleep(600);
    u.exec('undoLast()');
    check(u.S().players[0].legs === 0 && u.S().players[0].score === 40 && u.S().currentPlayer === 0 && u.S().legStarter === 0, 'undo annule le leg gagne');
    const s = loadGame(createEnv({ cfgMode: '501', cfgFinish: 'double', cfgLegs: '3', cfgSets: '3' }));
    s.exec('PLAYER_COUNT=2;startGame()');
    const win = async i => { s.exec('STATE.currentPlayer=' + i + ';STATE.dartsThisTurn=[];STATE.players[' + i + '].score=40;throwDart(20,2)'); await s.sleep(600); };
    await win(0); await win(0);
    check(s.S().players[0].sets === 1 && s.S().players.every(p => p.legs === 0) && s.S().legStarter === 1, 'sets : set 1 gagne (2 legs), legs remis a 0, l’autre commence');
    await win(0); await win(0);
    check(s.S().gameOver && s.S().players[0].sets === 2, 'sets : 2 sets = match gagne');
    const one = setupGame({});
    check(!one.exec('isMatchFormat()'), 'partie simple : pas de format de match par defaut');
  }
  { // coach de checkout personnalise
    const t = setupGame({});
    t.exec('STATE.players[0].dbl={20:[3,0]}');
    check(t.exec('coachRoute(40,3,"Greg")') === null, 'coach : pas assez de donnees -> route standard');
    t.exec('STATE.players[0].dbl={20:[40,2],8:[40,30]};coachVersion++');
    const c = t.exec('coachRoute(40,3,"Greg")');
    check(c && c.seg === 8 && c.pct >= 60 && !c.standard, 'coach : D20 faible / D8 fort -> route finie sur D8', JSON.stringify(c));
    const v = c.route.split(' ').map(k => k === 'DBull' ? 50 : k === 'Bull' ? 25 : k[0] === 'T' ? 3 * k.slice(1) : k[0] === 'D' ? 2 * k.slice(1) : +k).reduce((a, b) => a + b);
    check(v === 40, 'coach : la route fait bien 40', c.route);
    t.exec('STATE.players[0].score=40;renderCheckout()');
    check(t.elFor('checkoutRoute').textContent === c.route, 'coach : route affichee dans l’encadre de checkout');
    t.exec('SETTINGS.coach=false;renderCheckout()');
    check(t.elFor('checkoutRoute').textContent === 'D20', 'coach desactive : route standard');
    t.exec('SETTINGS.coach=true;saveDoubleStats()');
    check(t.exec('loadCareer().dbl.Greg[8][1]') === 30, 'coach : doubles sauvegardes en carriere');
  }
  { // adversaire a ton image : double et fantome
    const env = createEnv({ cfgMode: '501', cfgFinish: 'double', cfgOpponent: 'twin', playerName1: 'Greg' });
    const t = loadGame(env);
    t.exec('localStorage.setItem(CAREER_KEY,JSON.stringify({profiles:{Greg:{games:3,wins:1,scored:2700,darts:90,bestTurn:100}},history:[]}))');
    t.exec('PLAYER_COUNT=1;startGame()');
    check(t.S().players[1].isBot && /double/.test(t.S().players[1].name) && t.S().botAvg === 90, 'Mon double : bot calibre sur ma moyenne (90)', t.S().players[1].name + ' ' + t.S().botAvg);
    // record : Greg gagne en 2 volees (T20 x3 = 180, puis il reste 321 -> on force un finish)
    const g = loadGame(createEnv({ cfgMode: '301', cfgFinish: 'double', playerName1: 'Greg', playerName2: 'Leo' }));
    g.exec('PLAYER_COUNT=2;startGame()');
    g.exec('throwDart(20,3);throwDart(20,3);throwDart(20,3)'); await g.sleep(560);
    g.exec('throwDart(0,1);throwDart(0,1);throwDart(0,1)'); await g.sleep(560);
    g.exec('throwDart(20,3);throwDart(11,1);throwDart(25,2)'); await g.sleep(600);
    check(g.S().gameOver && g.exec('ghostOf("Greg","301-do").darts') === 6, 'fantome : record enregistre (6 flechettes)');
    g.exec('document.getElementById("cfgOpponent").value="ghost";PLAYER_COUNT=1;document.getElementById("playerName1").value="Greg";startGame()');
    check(g.S().players[1].ghost && g.S().players[1].ghostVisits.length === 2, 'fantome : adversaire cree depuis le record');
    g.exec('STATE.currentPlayer=1;STATE.dartsThisTurn=[]');
    const d1 = g.exec('ghostDart(STATE.players[1])');
    check(d1.label === 'T20', 'fantome : rejoue la premiere flechette du record', JSON.stringify(d1));
  }
  { // handicap automatique
    const t = loadGame(createEnv({ cfgMode: '501', cfgFinish: 'double', playerName1: 'Greg', playerName2: 'Leo' }));
    t.exec('localStorage.setItem(CAREER_KEY,JSON.stringify({profiles:{Greg:{games:2,darts:60,scored:1800},Leo:{games:2,darts:60,scored:900}},history:[]}))');
    t.exec('document.getElementById("cfgHandicap").checked=true;PLAYER_COUNT=2;startGame()');
    check(t.S().handicap && t.S().players[0].score === 501 && t.S().players[1].score === 251, 'handicap : Greg (90) 501, Leo (45) 251', t.S().players.map(p => p.score).join('/'));
  }
  { // tournoi : poule puis elimination
    const t = loadGame(createEnv({ cfgMode: '301', cfgFinish: 'double', cfgLegs: '1', cfgSets: '1' }));
    const lg = t.exec('createTourney(["A","B","C","D"],"league",cfgSnapshot())');
    check(lg.matches.length === 6, 'poule 4 joueurs : 6 matchs');
    t.exec('saveTourney(createTourney(["A","B","C","D"],"league",cfgSnapshot()))');
    let guard = 0;
    while (t.exec('!!nextMatch(loadTourney())') && guard++ < 10) {
      t.exec('playTourneyMatch()');
      const winA = t.exec('STATE.players[0].name') === 'A' || t.exec('STATE.players[1].name') !== 'A';
      t.exec('STATE.currentPlayer=0;STATE.dartsThisTurn=[];STATE.players[0].score=40;throwDart(20,2)');
      await t.sleep(560);
    }
    const tl = t.exec('loadTourney()');
    check(tl.matches.every(m => m.winner) && tl.champion, 'poule : tous les matchs joues, champion designe (' + tl.champion + ')');
    check(t.exec('standings(loadTourney())[0].pts') >= 4, 'poule : classement calcule');
    t.exec('backToSetup()');
    const ko = t.exec('createTourney(["A","B","C","D","E"],"ko",cfgSnapshot())');
    check(ko.matches.filter(m => m.round === 1).length === 4 && ko.matches.filter(m => m.bye).length === 3, 'elimination 5 joueurs : 3 exempts au 1er tour');
    t.exec('saveTourney(createTourney(["A","B","C","D","E"],"ko",cfgSnapshot()))');
    let played = 0; guard = 0;
    while (t.exec('!!nextMatch(loadTourney())') && guard++ < 10) {
      t.exec('playTourneyMatch();STATE.currentPlayer=1;STATE.dartsThisTurn=[];STATE.players[1].score=40;throwDart(20,2)');
      await t.sleep(560); played++;
    }
    check(played === 4 && t.exec('loadTourney().champion'), 'elimination : 4 matchs joues puis champion', 'joues=' + played);
  }
  { // nouveaux modes : Shanghai
    const t = setupGame({ mode: 'shanghai' });
    t.exec('throwDart(1,1);throwDart(1,2);throwDart(1,3)'); await t.sleep(600);
    check(t.S().gameOver && t.S().players[0].score === 6, 'Shanghai : simple+double+triple du 1 = victoire immediate');
    const u = setupGame({ mode: 'shanghai' });
    for (let r = 1; r <= 7; r++) for (let i = 0; i < 2; i++) { u.exec('STATE.dartsThisTurn=[];throwDart(' + r + ',' + (i === 0 ? 3 : 1) + ');throwDart(0,1);throwDart(0,1)'); await u.sleep(560); }
    check(u.S().gameOver && u.S().players[0].score === 84 && u.S().players[1].score === 28, 'Shanghai : 7 manches, le plus gros total gagne (84 contre 28)', u.S().players.map(p => p.score).join('/'));
  }
  { // Killer
    const t = setupGame({ mode: 'killer' });
    check(t.S().players.every(p => p.lives === 3 && p.kNum >= 1 && p.kNum <= 20) && t.S().players[0].kNum !== t.S().players[1].kNum, 'Killer : numeros differents et 3 vies');
    t.exec('STATE.players[0].kNum=20;STATE.players[1].kNum=5');
    const visit = async (a, b, c) => { t.exec('STATE.dartsThisTurn=[];throwDart(' + a + ');throwDart(' + b + ');throwDart(' + c + ')'); await t.sleep(560); };
    await visit('5,2', '20,2', '5,2'); // 1er D5 sans effet, D20 = killer, 2e D5 retire une vie
    check(t.S().players[0].isKiller && t.S().players[1].lives === 2, 'Killer : double de son numero = killer, puis double adverse = -1 vie', 'lives=' + t.S().players[1].lives);
    await visit('0,1', '0,1', '0,1');
    await visit('5,2', '5,2', '0,1');
    check(t.S().gameOver && t.S().players[1].lives === 0, 'Killer : dernier en vie gagne');
    t.exec('BOT2_SIGMA_OVERRIDE=0.01');
    const k = setupGame({ mode: 'killer', players: ['Greg'] });
    k.exec('b2Dart=function(tok){return {tok:tok}};STATE.currentPlayer=1;STATE.players[1].kNum=7;STATE.players[1].isKiller=false;STATE.players[0].kNum=12');
    check(k.exec('botKillerDart(100).tok') === 'D7', 'Killer : le bot vise le double de son numero');
    k.exec('STATE.players[1].isKiller=true');
    check(k.exec('botKillerDart(100).tok') === 'D12', 'Killer : devenu killer, le bot vise le double adverse');
  }
  { // 121
    const t = loadGame(createEnv({ cfgMode: 'co121' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    check(t.S().players.length === 1 && t.S().players[0].score === 121, '121 : solo, depart a 121');
    t.exec('throwDart(20,3);throwDart(11,1);throwDart(25,2)'); await t.sleep(600);
    check(t.S().ms.target === 122 && t.S().players[0].score === 122 && t.S().ms.success === 1, '121 : finish reussi, cible 122');
    t.exec('undoLast()');
    check(t.S().ms.target === 121 && t.S().ms.success === 0 && t.S().dartsThisTurn.length === 2, 'undo 121 : etat du mode restaure');
    t.exec('STATE.dartsThisTurn=[];STATE.players[0].score=122;STATE.ms={target:122,visit:0,attempt:2,best:121,success:1}');
    for (let i = 0; i < 3; i++) { t.exec('STATE.dartsThisTurn=[];throwDart(0,1);throwDart(0,1);throwDart(0,1)'); await t.sleep(560); }
    check(t.S().ms.target === 122 && t.S().ms.attempt === 3 && t.S().players[0].score === 122, '121 : 3 volees ratees = essai perdu, meme cible');
  }
  { // Doubles aleatoires
    const t = loadGame(createEnv({ cfgMode: 'doubles' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    const tg = t.exec('STATE.ms.targets[0]');
    check(t.exec('STATE.ms.targets.length') === 20, 'Doubles : 20 cibles tirees');
    t.exec('throwDart(' + tg + ',2);throwDart(' + tg + ',2);throwDart(' + (tg === 20 ? 1 : 20) + ',2)'); await t.sleep(600);
    check(t.S().players[0].score === 2 && t.S().ms.idx === 1, 'Doubles : seul le double annonce compte (2 touches)');
  }
  { // 7. bouton retour Android
    const t = setupGame({});
    let confirms = 0;
    t.ctx.confirm = () => { confirms++; return false; };
    check(t.exec('backAction()') === 'quit', 'retour en partie : demande de confirmation');
    t.exec('handleBack()');
    check(confirms === 1 && t.exec('currentScreen') === 'screenGame', 'retour en partie : confirmation refusee -> reste en partie');
    t.ctx.confirm = () => true;
    t.exec('handleBack()');
    check(t.exec('currentScreen') === 'screenSetup', 'retour en partie : confirmation acceptee -> menu');
    t.exec('showScreen("screenSettings")');
    check(t.exec('handleBack()') === 'menu' && t.exec('currentScreen') === 'screenSetup', 'retour depuis Reglages -> menu');
    check(t.exec('backAction()') === 'exit', 'retour au menu : 2e appui pour quitter');
    // garde : jamais posee hors geste utilisateur (Chromium la sauterait), une seule a la fois
    const pushes = []; let pop = null;
    t.ctx.history = { replaceState() {}, pushState(s) { pushes.push(s); } };
    t.ctx.addEventListener = (ty, f) => { if (ty === 'popstate') pop = f; };
    t.exec('initBackButton()');
    check(pushes.length === 0, 'garde retour : rien pose au demarrage (sans geste)');
    t.exec('armBackGuard();armBackGuard()');
    check(pushes.length === 1, 'garde retour : posee au 1er geste, une seule fois');
    t.exec('showScreen("screenStats")');
    pop();
    check(t.exec('currentScreen') === 'screenSetup' && pushes.length === 1, 'popstate : ecran precedent, garde consommee');
    t.exec('armBackGuard()');
    check(pushes.length === 2, 'garde retour : reposee au geste suivant');
  }
}

/* ---------------- Phase 2 : correctifs P0/P1 ---------------- */
async function testsPhase2Fixes() {
  console.log('\n== Phase 2 : regressions P0/P1 ==');
  { // Fix 3 : pas de saisie parasite pendant la fenetre de fin de volee
    const t = loadGame(createEnv());
    t.exec('PLAYER_COUNT=1;document.getElementById("cfgMode").value="501";startGame()');
    t.exec('STATE.players[0].score=40;STATE.currentPlayer=0');
    t.exec('throwDart(20,2)');
    t.exec('throwDart(1,1)'); // doit etre ignore (visitClosing)
    await t.sleep(700);
    const s = t.S();
    check(s.gameOver && s.players[0].score === 0, 'fix3 : checkout non annulable par un tap parasite', JSON.stringify({ score: s.players[0].score, over: s.gameOver }));
  }
  { // Fix 3 : undo annule proprement la fin programmee
    const t = loadGame(createEnv());
    t.exec('PLAYER_COUNT=1;document.getElementById("cfgMode").value="501";startGame()');
    t.exec('STATE.players[0].score=40;STATE.currentPlayer=0');
    t.exec('throwDart(20,2)');
    t.exec('undoLast()');
    await t.sleep(700);
    const s = t.S();
    check(s.players[0].score === 40 && !s.gameOver && s.dartsThisTurn.length === 0 && s.players[0].turns === 0, 'fix3 : undo pendant la fenetre annule la fin de visite', JSON.stringify({ score: s.players[0].score, over: s.gameOver }));
  }
  { // Fix 4 : quickScore compte 3 flechettes
    const t = loadGame(createEnv());
    t.exec('PLAYER_COUNT=1;document.getElementById("cfgMode").value="501";startGame()');
    t.exec('STATE.players[0].score=200;STATE.currentPlayer=0');
    t.exec('quickScore(60)');
    await t.sleep(600);
    const p = t.S().players[0];
    const okAvg = (p.dartsThrown === 3 && p.totalScored === 60 && Math.round(3 * p.totalScored / p.dartsThrown) === 60);
    check(okAvg && p.count60 === 1, 'fix4 : quickScore = 3 flechettes (moyennes carriere coerentes)', JSON.stringify({ d: p.dartsThrown, s: p.totalScored }));
  }
  { // Fix 5 : sauvegarde corrompue + banniere reprise
    const t = loadGame(createEnv());
    t.exec('localStorage.setItem(STORAGE_KEY,"{\\"gameOver\\":false}")');
    let crashed = false;
    try { t.exec('updateResumeBtn()'); } catch (e) { crashed = true; console.log('   err=' + e.message); }
    check(!crashed, 'fix5 : updateResumeBtn sur save corrompue sans crash');
    check(t.exec('document.getElementById("resumeBtn").style.display') === 'none', 'fix5 : banniere masquee sur save corrompue');
  }
  { // Fix 6 : quit annule la partie fantome du bot
    const t = loadGame(createEnv());
    t.exec('PLAYER_COUNT=1;document.getElementById("cfgMode").value="501";startGame()');
    t.exec('skipTurn()');                 // tour passe au bot -> maybeBotTurn programme
    await t.sleep(1300);                  // le bot demarre sa volee
    t.exec('confirmQuit()');              // quitter = session invalidee
    await t.sleep(3300);                  // sans fix, le bot aurait termine sa volee + endTurn
    const s = t.S();
    check(s.players[1].turns === 0 && !s.gameOver, 'fix6 : partie fantome tuee apres quit', JSON.stringify({ turns: s.players[1].turns, over: s.gameOver }));
  }
  { // Fix 1 : netLaunch garde le socket de l'hote
    const t = loadGame(createEnv());
    t.exec('globalThis.__closed=false;NET={mode:"host",started:true,code:"X",seat:0,roster:[{seat:1,name:"A"}],joinUrl:"",ws:{readyState:1,send(){},close(){globalThis.__closed=true}}};STATE.online=true');
    t.exec('netLaunch()');
    check(t.exec('NET.ws!==null&&NET.ws.readyState===1') === true, 'fix1 : socket hote toujours ouvert apres netLaunch');
    check(t.exec('globalThis.__closed') === false, 'fix1 : close() jamais appele au lancement');
    check(t.exec('NET.mode') === 'host', 'fix1 : mode hote conserve');
  }
  { // Fix 1 (client) : netHidePanel ne ferme pas le socket (utilise par 'started' et 'netLaunch')
    const t = loadGame(createEnv());
    t.exec('globalThis.__closed=false;NET.mode="client";NET.started=false;NET.ws={readyState:1,send(){},close(){globalThis.__closed=true}}');
    t.exec('NET.applyState({players:[{name:"Hote",score:501}],currentPlayer:0})');
    let crashed = false;
    try { t.exec('netHidePanel();showScreen("screenGame");NET.gate()'); } catch (e) { crashed = true; }
    check(!crashed, 'fix1 : gate client sans crash');
    check(t.exec('globalThis.__closed') === false && t.exec('NET.ws.readyState') === 1, 'fix1 : netHidePanel preserve le socket client');
    check(t.S().players[0].name === 'Hote', 'fix1 : applyState applique etat serveur');
  }
  { // Fix 2 : overlay victoire client avec la bonne classe CSS
    const t = loadGame(createEnv());
    t.exec('netShowWinner("Lea")');
    const el = t.elFor('winnerOverlay');
    check(el.classList.contains('active') && !el.classList.contains('show'), 'fix2 : overlay victoire client utilise .active');
  }
  { // Fix 7 : backoff TTS distant hors ligne
    const env = createEnv();
    env.Audio = class { constructor(s) { this.src = s; } play() { return Promise.resolve(); } pause() {} };
    env.__fetched = [];
    env.fetch = url => { env.__fetched.push(url); return Promise.reject(new Error('offline')); };
    const t = loadGame(env);
    t.exec('voiceLang="fr"');
    t.exec('speak("soixante")');                      // echec fetch -> repli direct Audio
    await t.sleep(50);
    t.exec('remoteBlockedUntil=Date.now()+60000');    // simule le blocage constate hors ligne
    t.exec('speak("soixante et un")');
    await t.sleep(50);
    check(t.exec('__fetched.length') === 1, 'fix7 : backoff — plus aucun appel reseau pendant le blocage', String(t.exec('__fetched.length')));
  }
}

/* ---------------- Modes d entraînement (nouveaux) ---------------- */
async function testsPracticeModes() {
  console.log('\n== Modes d entrainement (Bob 27 / Catch 40 / Highscore / variantes) ==');
  { // Bob's 27 : touches, rates, simple non compte
    const t = loadGame(createEnv({ cfgMode: 'bobs27' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    check(t.S().players.length === 1 && !t.S().players[0].isBot, 'bobs27 : solo sans bot');
    check(t.S().players[0].score === 27 && t.S().bobsRound === 1, 'bobs27 : depart 27, tour 1');
    await throwVisit(t, [[1, 2], [1, 2], [1, 2]]);
    check(t.S().players[0].score === 33, 'bobs27 : 3 touches D1 = +6', 'score=' + t.S().players[0].score);
    toPlayer(t, 0);
    await throwVisit(t, [[2, 1], [0, 1], [0, 1]]);
    check(t.S().players[0].score === 29 && t.S().bobsRound === 3, 'bobs27 : rate D2 = -4, tour 3', JSON.stringify({ s: t.S().players[0].score, r: t.S().bobsRound }));
    toPlayer(t, 0);
    await throwVisit(t, [[3, 1], [0, 1], [0, 1]]);
    check(t.S().players[0].score === 23, 'bobs27 : simple sur D3 ne compte pas (-6)', 'score=' + t.S().players[0].score);
  }
  { // Bob's 27 : echec immediat quand le score passe <= 0
    const t = loadGame(createEnv({ cfgMode: 'bobs27' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    t.exec('STATE.players[0].score=1;STATE.bobsRound=3');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 1], [0, 1], [0, 1]]);
    check(t.S().gameOver === true, 'bobs27 : fin quand score <= 0');
  }
  { // Bob's 27 : DBull au tour 20 termine la partie
    const t = loadGame(createEnv({ cfgMode: 'bobs27' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    t.exec('STATE.bobsRound=20;STATE.players[0].score=30');
    toPlayer(t, 0);
    await throwVisit(t, [[25, 2], [0, 1], [0, 1]]);
    check(t.S().gameOver === true && t.S().players[0].score === 80, 'bobs27 : DBull tour 20 = +50 et fin', 'over=' + t.S().gameOver + ' s=' + t.S().players[0].score);
  }
  { // Catch 40 : volée >= 40 garde les vies, < 40 en perdre une, 0 vie = fin
    const t = loadGame(createEnv({ cfgMode: 'catch40' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 3], [0, 1]]);
    check(t.S().lives === 3 && t.S().players[0].score === 120, 'catch40 : volée 120 valide');
    toPlayer(t, 0);
    await throwVisit(t, [[0, 1], [0, 1], [0, 1]]);
    check(t.S().lives === 2 && !t.S().gameOver, 'catch40 : volée 0 → une vie perdue', 'lives=' + t.S().lives);
    t.exec('STATE.lives=1');
    toPlayer(t, 0);
    await throwVisit(t, [[0, 1], [0, 1], [0, 1]]);
    check(t.S().gameOver === true, 'catch40 : 0 vie = fin');
  }
  { // Catch 40 : 10 volées jouées = fin (quickScore bloqué en catch40, vraies fléchettes)
    const t = loadGame(createEnv({ cfgMode: 'catch40' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    for (let i = 0; i < 10; i++) { toPlayer(t, 0); await throwVisit(t, [[20, 1], [20, 1], [5, 1]]); }
    check(t.S().gameOver === true, 'catch40 : fin après 10 volées (10 × 45)');
  }
  { // Highscore : additionnette sur 10 volées
    const t = loadGame(createEnv({ cfgMode: 'highscore' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    for (let i = 0; i < 10; i++) { toPlayer(t, 0); t.exec('quickScore(60)'); await t.sleep(500); }
    check(t.S().gameOver === true && t.S().players[0].score === 600, 'highscore : 10 x 60 = 600 puis fin', 's=' + t.S().players[0].score + ' over=' + t.S().gameOver);
  }
  { // Around doubles : seul le double du numéro valide
    const t = loadGame(createEnv({ cfgMode: 'around', cfgAround: '2' }));
    t.exec('PLAYER_COUNT=2;startGame()');
    check(t.S().aroundVariant === 2, 'around doubles : variante chargée');
    await throwVisit(t, [[1, 1], [0, 1], [0, 1]]);
    check(t.S().aroundClock[0] === 1, 'around doubles : simple 1 refuse');
    toPlayer(t, 0);
    await throwVisit(t, [[1, 2], [0, 1], [0, 1]]);
    check(t.S().aroundClock[0] === 2, 'around doubles : double 1 valide', 'c=' + t.S().aroundClock[0]);
  }
  { // 901 avec bot
    const t = loadGame(createEnv({ cfgMode: '901' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    check(t.S().players.length === 2 && t.S().players.every(p => p.score === 901), '901 : depart avec bot a 901');
  }
  { // Double-in : rien compte avant le premier double
    const t = loadGame(createEnv({ cfgMode: '501' }));
    t.exec('PLAYER_COUNT=1;startGame()');
    t.elFor('cfgDoubleIn').checked = true;
    t.exec('startGame()');
    check(t.S().doubleIn === true, 'double-in : option lue');
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    check(t.S().players[0].score === 501 && t.S().players[0].dartsThrown === 3, 'double-in : volée sans double niee', 's=' + t.S().players[0].score);
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 2], [20, 1]]);
    check(t.S().players[0].score === 441 && t.S().players[0].started === true, 'double-in : crédité après le premier double', 's=' + t.S().players[0].score);
  }
  { // Cricket cut-throat : les points vont aux adversaires non fermés
    const t = loadGame(createEnv({ cfgMode: 'cricket', playerName1: 'Greg', playerName2: 'Lea' }));
    t.elFor('cfgCutThroat').checked = true;
    t.exec('PLAYER_COUNT=2;startGame()');
    check(t.S().cutThroat === true, 'cut-throat : option lue');
    t.exec('STATE.cricketMarks[0][20]=3');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    check(t.S().players[0].score === 0 && t.S().players[1].score === 180, 'cut-throat : extra T20×3 = 180 crédité a Lea', JSON.stringify(t.S().players.map(p => p.score)));
  }
  { // Bot : calibrage des moyennes (gaussienne étalée au niveau)
    const t = loadGame(createEnv());
    const res60 = t.exec('(function(){let s=0;for(let i=0;i<4000;i++)s+=botGenericDart(60).value;return Math.round(s/4000*10)/10;})()');
    check(res60 > 17 && res60 < 23, 'bot 60 : ~20 par fléchette en générique', String(res60));
    const res105 = t.exec('(function(){let s=0;for(let i=0;i<4000;i++)s+=botGenericDart(105).value;return Math.round(s/4000*10)/10;})()');
    check(res105 > 29 && res105 < 37, 'bot 105 : ~34 par fléchette en générique', String(res105));
  }
  { // Bot2 : cible choisie par le solveur (intention), tir geometrique ensuite
    const t = setupGame({ mode: '501', bot: '90', players: ['Greg'] });
    // a sigma 19.5 la marge T20/S20 a 170 est du bruit (v~0.001) : viser la region 20\r\n    check(['T20','S20'].includes(t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[3][170]')), 'bot2 : depuis 170, vise la region 20', t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[3][170]'));
    check(t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[3][32]') === 'D16', 'bot2 : depuis 32, D16 vise', t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[3][32]'));
    check(t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[1][40]') === 'D20', 'bot2 : derniere flechette a 40, D20 vise', t.exec('b2PolicyOf(STATE.finishDouble,b2SigmaOf(90)).best[1][40]'));
    let move = false;
    for (let i = 0; i < 15 && !move && !t.S().gameOver; i++) {
      t.exec('STATE.currentPlayer=1;STATE.isBotTurn=false;STATE.dartsThisTurn=[];STATE.players[1].score=170;maybeBotTurn()');
      await t.sleep(3400);
      move = t.S().players[1].score !== 170 || t.S().players[1].busts > 0 || t.S().gameOver;
    }
    check(move, 'bot : le score evolue depuis 170 (somme appliquee)', 'score=' + t.S().players[1].score + ' busts=' + t.S().players[1].busts);
  }
}

/* ---------------- Stats pro (First 9 / MPR / synthese / partage) ---------------- */
async function testsSummary() {
  console.log('\n== Stats : First 9, MPR, synthese, partage ==');
  { // First 9 : 9 flechettes pleines (3 x T20) en 701 = 540 pts, moyenne 180
    const t = setupGame({ mode: '701', players: ['Greg', 'Léo'] });
    for (let v = 0; v < 3; v++) { toPlayer(t, 0); await throwVisit(t, [[20, 3], [20, 3], [20, 3]]); }
    check(t.S().players[0].first9 === 540, 'first9 : 9 darts T20 = 540 pts', String(t.S().players[0].first9));
    check(t.exec('matchSummary(STATE.players[0]).first9') === 180, 'first9 : moyenne par volée = 180', String(t.exec('matchSummary(STATE.players[0]).first9')));
  }
  { // First 9 : un bust ne rapporte rien, un checkout compte
    const t = setupGame({ mode: '501', players: ['Greg', 'Léo'] });
    t.exec("STATE.players[0].score=221"); // v1 : 180
    toPlayer(t, 0); await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    t.exec("STATE.players[0].score=41");  // v2 : T20 -> bust negatif
    toPlayer(t, 0); await throwVisit(t, [[20, 3]]);
    t.exec("STATE.players[0].score=41");  // v3 : 7 + 0 + D17 = checkout
    toPlayer(t, 0); await throwVisit(t, [[7, 1], [0, 1], [17, 2]]);
    check(t.S().gameOver === true, 'first9 : checkout 41 en 3 flechettes', 'over=' + t.S().gameOver);
    check(t.S().players[0].first9 === 221, 'first9 : 180 + 0 (bust) + 41 = 221', String(t.S().players[0].first9));
  }
  { // First 9 + double-in : les flechettes d ouverture nulles ne comptent pas
    const t = setupGame({ mode: '501', players: ['Greg', 'Léo'] });
    t.elFor('cfgDoubleIn').checked = true;
    t.exec('startGame()');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 2], [20, 1]]);
    check(t.S().players[0].first9 === 60, 'first9 double-in : D20 + T20 = 60 (T20 initial nié)', String(t.S().players[0].first9));
  }
  { // MPR cricket : 3 marques sur le premier tour = MPR 3
    const t = loadGame(createEnv({ cfgMode: 'cricket', playerName1: 'Greg', playerName2: 'Léo' }));
    t.exec('PLAYER_COUNT=2;startGame()');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    t.exec('endGame(STATE.players[0])');
    check(t.S().players[0].mpr === 3, 'MPR : 3 marques / 1 tour = 3.0', String(t.S().players[0].mpr));
    check(t.exec('matchSummary(STATE.players[0]).mpr') === 3, 'matchSummary : MPR reporté');
  }
  { // v1.7 : nouveaux records, entrainements, sauvegarde
    const t = setupGame({ mode: '501', players: ['Greg'] });
    t.exec('STATE.players[0].score=40');
    await throwVisit(t, [[20, 2]]);
    t.exec('PLAYER_COUNT=1;startGame()');
    t.exec('STATE.players[0].score=100');
    await throwVisit(t, [[20, 3], [20, 2]]);
    const recs = t.exec('JSON.stringify(STATE.lastRecords)');
    check(/Plus haut checkout/.test(recs) && /100/.test(recs) && /Meilleur leg/.test(recs) === false, 'v1.7 records : nouveau plus haut checkout detecte (100 > 40)', recs);
    check(/Nouveaux? records?/.test(t.elFor('winnerRecords').innerHTML), 'v1.7 records : affiches sur l ecran de victoire');
    t.exec('STATE.mode="bobs27";STATE.gameOver=false;STATE.players[0].score=150;endPractice(STATE.players[0],true,"x")');
    t.exec('STATE.gameOver=false;STATE.players[0].score=210;endPractice(STATE.players[0],true,"x")');
    check(t.exec('loadCareer().training.Greg.bobs27.length') === 2 && t.exec('loadCareer().training.Greg.bobs27[0].v') === 210, 'v1.7 entrainement : Bobs 27 enregistre');
    check(/Record Bob/.test(t.exec('JSON.stringify(STATE.lastRecords)')), 'v1.7 entrainement : record de seance detecte');
    t.exec('renderStatsScreen()');
    check(t.elFor('statsPlayer').innerHTML.indexOf('Entraînements') >= 0, 'v1.7 entrainement : carte dans le tableau de bord');
    const bk = t.exec('careerBackupText()');
    t.exec('localStorage.removeItem(CAREER_KEY)');
    const parsed = t.exec('JSON.stringify(parseCareerBackup(' + JSON.stringify(bk) + ').profiles.Greg.games)');
    check(parsed === '2', 'v1.7 sauvegarde : export puis relecture', parsed);
    check(t.exec('parseCareerBackup("pas du json")') === null && t.exec('parseCareerBackup("{\\"a\\":1}")') === null, 'v1.7 sauvegarde : texte invalide refuse');
  }
  { // Carriere : F9 et MPR persistes et affiches
    const t = loadGame(createEnv({ cfgMode: 'cricket', playerName1: 'Greg', playerName2: 'Léo' }));
    t.exec('PLAYER_COUNT=2;startGame()');
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]);
    t.exec('endGame(STATE.players[0])');
    check(t.exec('mprOf(loadCareer().profiles["Greg"])') === 3, 'carrière : MPR Greg = 3', String(t.exec('mprOf(loadCareer().profiles["Greg"])')));
    t.exec('renderStatsScreen()');
    const html = t.elFor('statsProfiles').innerHTML;
    check(html.indexOf('F9') >= 0 && html.indexOf('MPR') >= 0, 'écran stats : colonnes F9 et MPR présentes');
  }
  { // Partage : navigator.share, repli presse-papiers, repli toast
    const t = setupGame({ mode: '501', players: ['Greg', 'Léo'] });
    for (let v = 0; v < 3; v++) { toPlayer(t, 0); await throwVisit(t, [[20, 3], [20, 3], [20, 3]]); }
    t.exec("endGame(STATE.players[0])");
    t.exec('navigator.share=function(o){navigator.__shared=o;return Promise.resolve()}');
    t.exec('navigator.__shared=null;shareMatchStats()');
    const sh = t.exec('navigator.__shared ? navigator.__shared.text : null');
    check(!!sh && sh.indexOf('Moyenne / volée') >= 0 && sh.indexOf('First 9') >= 0, 'partage : texte via navigator.share', String(sh && sh.slice(0, 60)));
    t.exec('delete navigator.share;navigator.clipboard={writeText:function(x){navigator.__clip=x}}');
    t.exec('navigator.__clip=null;shareMatchStats()');
    check(t.exec('navigator.__clip') !== null && String(t.exec('navigator.__clip')).indexOf('Moyenne') >= 0, 'partage : repli presse-papiers', String(t.exec('navigator.__clip') || '').slice(0, 60));
    t.exec('delete navigator.clipboard;shareMatchStats()'); // ni share ni clipboard : toast erreur, sans crash
  }
  { // matchSummary : pire volée = min des volées > 0
    const t = setupGame({ mode: '501', players: ['Greg', 'Léo'] });
    toPlayer(t, 0);
    await throwVisit(t, [[20, 3], [20, 3], [20, 3]]); // 180
    t.exec('STATE.currentPlayer=0');
    t.exec('throwDart(0,1);throwDart(0,1);throwDart(0,1)');
    await t.sleep(600); // volée 0 soldée -> turnHistory [180, 0]
    check(t.exec('matchSummary(STATE.players[0]).worst') === 180, 'matchSummary : pire volée ignore les 0', String(t.exec('matchSummary(STATE.players[0]).worst')));
  }
}

/* ---------------- Thème (sombre / clair) ---------------- */
async function testsTheme() {
  console.log('\n== Theme sombre / clair ==');
  { // par défaut : sombre + theme-color de statut
    const t = loadGame(createEnv());
    t.exec('applyTheme()');
    check(t.ctx.document.body.dataset.theme === 'dark', 'theme : sombre par défaut', String(t.ctx.document.body.dataset.theme));
    const meta = t.ctx.document.querySelector('meta[name="theme-color"]');
    check(!meta || meta.getAttribute('content') === '#07091a', 'theme : theme-color sombre (pas de meta simulée)');
  }
  { // bascule clair persistée
    const t = loadGame(createEnv());
    t.elFor('setTheme').value = 'light';
    t.exec('persistSettings()');
    check(t.ctx.document.body.dataset.theme === 'light', 'theme : clair appliqué', String(t.ctx.document.body.dataset.theme));
    const raw = t.store.get('perfectdarts_settings_v1');
    check(raw && JSON.parse(raw).theme === 'light', 'theme : persisté dans localStorage', String(raw).slice(0, 80));
  }
  { // reprise : settings déjà en clair
    const t = loadGame(createEnv());
    t.store.set('perfectdarts_settings_v1', JSON.stringify({ theme: 'light' }));
    t.exec('loadSettings();applyTheme()');
    check(t.ctx.document.body.dataset.theme === 'light', 'theme : reprise du réglage sauvegardé');
  }
  { // reset : retour au sombre
    const t = loadGame(createEnv());
    t.store.set('perfectdarts_settings_v1', JSON.stringify({ theme: 'light' }));
    t.exec('loadSettings()');
    t.elFor('setTheme').value = 'dark';
    t.exec('persistSettings()');
    check(t.ctx.document.body.dataset.theme === 'dark', 'theme : retour au sombre persisté');
  }
}

/* ---------------- Orchestration ---------------- */
async function run() {
  console.log('BATTERIE DE TESTS PERFECT DART\n');
  await tests501Double();
  await tests501Straight();
  await testsModes();
  await testsBot();
  await testsPracticeModes();
  await testsSummary();
  await testsPersistence();
  await testsSettings();
  await testsTheme();
  await testsStats();
  await testsCheckouts();
  await testsNetOffline();
  await testsVoiceRemote();
  await testsPhase2Fixes();
  await testsV152();
  console.log('\n========================================');
  console.log('RESULTAT : ' + passed + ' PASS / ' + failed + ' FAULT');
  if (failures.length) { console.log('\nFAILLES :'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error('CRASH BATTERIE :', e); process.exit(2); });

