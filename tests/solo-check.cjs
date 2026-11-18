'use strict';
/* Verif solo : parcours entiers via bots. */
const M = require('./marathon.cjs');
function soloBobs(level) {
  const t = M.loadFast(M.createEnv({ cfgMode: 'bobs27', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; M.checkInvariants(t, 'bobs27'); }
  return t.S();
}
function soloCatch(level) {
  const t = M.loadFast(M.createEnv({ cfgMode: 'catch40', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; M.checkInvariants(t, 'catch40'); }
  return t.S();
}
function soloHigh(level) {
  const t = M.loadFast(M.createEnv({ cfgMode: 'highscore', cfgBotLevel: String(level), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=1;startGame();STATE.players[0].isBot=true;maybeBotTurn()');
  let guard = 0;
  while (!t.S().gameOver && guard++ < 20000) { if (t.pump(200) === 0) break; M.checkInvariants(t, 'highscore'); }
  return t.S();
}
const b = soloBobs(60);
console.log('bobs27  : fini=', b.gameOver, ' tours=', b.players[0].turns, ' score=', b.players[0].score, ' round=', b.bobsRound);
const c = soloCatch(60);
console.log('catch40 : fini=', c.gameOver, ' tours=', c.players[0].turns, ' score=', c.players[0].score, ' vies=', c.lives);
const h = soloHigh(60);
console.log('highscore: fini=', h.gameOver, ' tours=', h.players[0].turns > 10 ? 10 : h.players[0].turns, ' score=', h.players[0].score);
console.log('INVARIANTS :', M.INV.checked, 'checked,', M.INV.bad.length, 'violations');
