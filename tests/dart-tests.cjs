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
  ['config.js', 'sounds.js', 'net.js', 'voice.js', 'stats.js', 'dartboard.js', 'game.js', 'bot2.js', 'ui.js'].forEach(f => {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, f), 'utf8'), ctx, { filename: f });
  });
  ['playEvent', 'announceCheckout', 'announceBust', 'recordGameToCareer', 'initVoice', 'pickVoice'].forEach(fn => {
    if (typeof ctx[fn] !== 'function') ctx[fn] = () => {};
  });
  if (!ctx.voiceSynth) ctx.voiceSynth = null;
  if (!ctx.voiceLang) ctx.voiceLang = 'off';
  vm.runInContext('this.__STATE = STATE; this.__CHECKOUTS = CHECKOUTS;', ctx);
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
    check(t.S().gameOver === true, '20 touche (passage BULL) -> victoire', 'gameOver=' + t.S().gameOver + ' cible=' + t.S().aroundClock[0]);
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
    check(t.exec('netUrl()') === 'ws://192.168.1.9:3210', 'netUrl : adresse sauvegardee utilisee', String(t.exec('netUrl()')));
    t.exec('document.getElementById("netServerAddr").value="10.0.0.5:3210"');
    check(t.exec('netUrl()') === 'ws://10.0.0.5:3210', 'netUrl : champ manuel prioritaire', String(t.exec('netUrl()')));
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
      play() { played.push(this.src); return Promise.resolve(); }
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
    await t.sleep(25);
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
  console.log('\n========================================');
  console.log('RESULTAT : ' + passed + ' PASS / ' + failed + ' FAULT');
  if (failures.length) { console.log('\nFAILLES :'); failures.forEach(f => console.log(' - ' + f)); }
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error('CRASH BATTERIE :', e); process.exit(2); });

