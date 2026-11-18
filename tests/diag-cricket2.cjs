'use strict';
/* Pompe bornee cricket : max 40 callbacks par cycle, dump etat regulier. */
const M = require('./marathon.cjs');
const lvl = Number(process.env.LVL || 60);
const t = M.loadFast(M.createEnv({ cfgMode: 'cricket', cfgBotLevel: String(lvl), cfgVoice: 'off' }));
t.exec('PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + lvl + ';maybeBotTurn()');
let lastPrint = 0, totalCycles = 0;
for (let i = 0; i < 2000000; i++) {
  const moved = t.pump(40);
  totalCycles++;
  const s = t.S();
  const flip = s.turnCount + (s.currentPlayer + 1) / 10;
  if (flip - lastPrint >= 200) {
    lastPrint = flip;
    console.log('cycles', totalCycles, 'turns', s.turnCount, 'cur', s.currentPlayer, 'marks', JSON.stringify(s.cricketMarks), 'scores', JSON.stringify(s.players.map(p => p.score)), 'isBotTurn', s.isBotTurn, 'darts', s.dartsThisTurn.length);
  }
  if (s.gameOver) { console.log('GAME OVER apres', totalCycles, 'cycles, turns', s.turnCount); break; }
  if (moved === 0) { console.log('FILE VIDE (stall) :', JSON.stringify({ cur: s.currentPlayer, botTurn: s.isBotTurn, darts: s.dartsThisTurn.length, over: s.gameOver })); break; }
}
