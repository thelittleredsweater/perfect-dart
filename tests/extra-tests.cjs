'use strict';
/* Tests complementaires bot2 : solveur (impossibles, straight vs double)
   + courbe de difficulte : bot vs humain scripte (S20 x3, finitions parfaites).
   node tests/extra-tests.cjs  */
const M = require('./marathon.cjs');

let pass = 0, fault = 0;
const fails = [];
function check(ok, label, detail) {
  if (ok) pass++;
  else { fault++; fails.push(label + (detail ? ' — ' + detail : '')); console.log('  [FAULT] ' + label + (detail ? ' — ' + detail : '')); }
}

/* ---------- A. Solveur ---------- */
{
  const t = M.loadFast(M.createEnv({ cfgMode: '501', cfgFinish: 'double', cfgBotLevel: '90', cfgVoice: 'off' }));
  t.exec('startGame()');
  t.exec('BOT2_SIGMA_OVERRIDE=11');
  const pol = t.exec('(function(){const p=b2PolicyOf(true,11);return JSON.stringify({W1:p.W[1],W2:p.W[2],W3:p.W[3],B1:p.best[1],B3:p.best[3]})})()');
  const p = JSON.parse(pol);
  const impos = [159, 162, 163, 165, 166, 168, 169];
  for (const r of impos) {
    // valeur residuelle EPS (plancher) ~0.005, jamais une vraie route (>0.05) :
    check(p.W3[r] < 0.05, 'solveur : ' + r + ' impossible (double out)', 'W=' + p.W3[r]);
    // et la politique reste en mode marquage (triple 19/20 ou simple 20), pas un double inexistant
    check(/^(S|T)?(19|20)$/.test(p.B3[r]), 'solveur : reste ' + r + ' impossible -> reste en mode marquage', p.B3[r]);
  }
  // P(D1) a sigma 11 ~ 0.3-0.4 par tentive : W[3][2] large mais pas garanti
  check(p.W3[2] > 0.35, 'solveur : 2 (D1) tres probable en 3 flechettes', p.W3[2]);
  check(p.B1[40] === 'D20', 'solveur : derniere flechette a 40 -> D20', p.B1[40]);
  // Straight out : au moins aussi facile que double out pour un meme reste
  const ps = JSON.parse(t.exec('(function(){const p=b2PolicyOf(false,11);return JSON.stringify({W3:p.W[3],B3:p.best[3]})})()'));
  check(ps.W3[60] >= p.W3[60], 'solveur : straight 60 >= double 60', ps.W3[60] + ' vs ' + p.W3[60]);
  // 3 a la derniere flechette en double out : impossible, seule la valeur residuelle EPS
  check(p.W1[3] < 0.02, 'solveur : 3 a la derniere flechette (double out) impossible', p.W1[3]);
}

/* ---------- B. Courbe de difficulte : humain scripte vs bot ---------- */
/* Humain : 3 x simple 20 tant que reste > 60 ; sinon la route exacte (CHECKOUTS).
   Finition parfaite, moy/visite 60 jusqu'a 60 restants. */
function legVsScriptedHuman(level) {
  const t = M.loadFast(M.createEnv({ cfgMode: '501', cfgFinish: 'double', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=2;startGame();STATE.players[1].isBot=true;maybeBotTurn()'); // joueurs[0]=humain, joueurs[1]=bot
  let guard = 0, winner = null;
  const throwHuman = () => {
    const rem = t.S().players[0].score;
    const left = 3 - t.S().dartsThisTurn.length;
    if (rem > 60) { t.exec('throwDart(20,1)'); return; }
    const route = t.exec('__CHECKOUTS[' + rem + ']');
    if (route && left > 0) {
      const tok = route.split(' ')[0];
      let mult = 1, base = tok;
      if (tok.startsWith('T')) { mult = 3; base = tok.slice(1); }
      else if (tok.startsWith('D')) { mult = 2; base = tok.slice(1); }
      const dblBase = base === 'Bull' ? 25 : Number(base);
      t.exec('throwDart(' + dblBase + ',' + mult + ')');
      return;
    }
    // pas de route jouable cette flechette : vise 20 simple (ou le max sans bust)
    t.exec('throwDart(20,1)');
  };
  while (!t.S().gameOver && guard++ < 4000) {
    t.pump();
    const s = t.S();
    if (s.gameOver) { winner = s.players[0].score === 0 ? 0 : 1; break; }
    if (s.currentPlayer === 0 && !s.isBotTurn && s.dartsThisTurn.length < 3) throwHuman();
  }
  return { winner, guard };
}
{
  // L'humain scripte (moy ~60 + finitions parfaites) doit perdre contre un bot fort
  // et gagner contre un bot faible : la courbe de difficulte se comporte.
  for (const [level, expectBotWin] of [[20, false], [110, true]]) {
    let botWins = 0;
    const N = 12;
    for (let i = 0; i < N; i++) {
      const r = legVsScriptedHuman(level);
      if (r.winner === 1) botWins++;
    }
    const share = botWins / N;
    if (expectBotWin) check(share >= 0.7, 'equilibre : bot ' + level + ' domine humain ~60', 'part=' + share);
    else check(share <= 0.35, 'equilibre : bot ' + level + ' perd vs humain ~60', 'part=' + share);
  }
}

console.log('\nRESULTAT extra : ' + pass + ' PASS / ' + fault + ' FAULT');
if (fails.length) console.log('FAILLES :\n - ' + fails.join('\n - '));
process.exit(fault ? 1 : 0);
