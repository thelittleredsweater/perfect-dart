'use strict';
/* Calibrage mono-niveau : process.env.LVL = niveau, CAL_LEGS = jambes (defaut 90).
   Sortie : ligne "CAL-LVL|sigma|ecart|darts" a la fin. */
const M = require('./marathon.cjs');
const { loadFast, createEnv } = M;

const lvl = Number(process.env.LVL || 60);
const LEGS = Number(process.env.CAL_LEGS || 90);

function measuredAvg(sigma, legs) {
  const t = loadFast(createEnv({ cfgMode: '501', cfgFinish: 'double', cfgBotLevel: String(lvl), cfgVoice: 'off' }));
  t.exec('PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + lvl + ';maybeBotTurn()');
  t.exec('BOT2_SIGMA_OVERRIDE=' + sigma);
  let legsDone = 0, stalls = 0;
  const dartsLeg = [];
  while (legsDone < legs) {
    const moved = t.pump();
    const s = t.S();
    if (s.gameOver) {
      legsDone++;
      dartsLeg.push(s.players[1].dartsThrown);
      if (legsDone < legs) t.exec('startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=' + lvl + ';maybeBotTurn();BOT2_SIGMA_OVERRIDE=' + sigma);
    } else if (moved === 0) {
      if (++stalls > 5) throw new Error('bloque sigma=' + sigma + ' lvl=' + lvl);
    } else stalls = 0;
  }
  /* metrique = celle affichee par l app : MOY = 3*points/darts (ici 501 pts = 1503/darts) */
  const d = M.mean(dartsLeg);
  return { avg: 1503 / d, darts: d };
}

(async () => {
  let lo = 2, hi = 140;
  let bestSigma = null, bestGap = 1e9, darts = 0;
  for (let it = 0; it < 8; it++) {
    const mid = lo + (hi - lo) / 2;
    const r = measuredAvg(mid, LEGS);
    const gap = r.avg - lvl;
    console.error('lvl ' + lvl + ' sigma ' + mid.toFixed(1) + ' -> avg ' + r.avg.toFixed(1));
    if (Math.abs(gap) < Math.abs(bestGap)) { bestGap = gap; bestSigma = mid; darts = r.darts; }
    if (Math.abs(gap) < 0.4) break;
    if (gap < 0) hi = mid; else lo = mid;
  }
  console.log('CAL-' + lvl + '|' + (Math.round(bestSigma * 10) / 10) + '|' + bestGap.toFixed(2) + '|' + darts.toFixed(1));
})().catch(e => { console.error('ERR ' + e.stack); process.exit(1); });
