'use strict';
const M = require('./marathon.cjs');
const t = M.loadFast(M.createEnv({ cfgMode: '501', cfgFinish: 'double', cfgBotLevel: '90', cfgVoice: 'off' }));
t.exec('PLAYER_COUNT=2;startGame();STATE.players[0].isBot=true;STATE.players[1].isBot=true;STATE.botAvg=90');
const rep = t.exec(`
(function(){
  const sig=b2SigmaOf(90);
  const out={sigma:sig};
  function ev(finishDouble,r,d){
    const pol=b2PolicyOf(finishDouble,sig);
    const W=pol.W,B=pol.best;
    const dists=B2_TARGETS.map(a=>({a,d:b2Dist(a.k,sig)}));
    const rows=[];
    for(const x of dists){
      let v=0;
      for(const o of x.d){
        const vHit=o.base===25?(o.mult===2?50:25):o.base*o.mult;
        if(vHit===r){ if(!finishDouble||o.mult===2)v+=o.prob; }
        else{ const rem=r-vHit;
          if(rem<0||(finishDouble&&rem===1)) v+=o.prob*B2_EPS*W[3][r];
          else v+=o.prob*(d>1?W[d-1][rem]:B2_EPS*W[3][rem]);
        }
      }
      if(v>0.0005)rows.push({k:x.a.k,v:+v.toFixed(4)});
    }
    rows.sort((p,q)=>q.v-p.v);
    out[finishDouble+'_'+r+'_'+d]={best:B[d][r],w:W[d][r],top:rows.slice(0,5)};
  }
  ev(false,60,3);
  ev(false,3,3);
  ev(true,170,3);
  return JSON.stringify(out);
})()
`);
const o = JSON.parse(rep);
console.log('sigma=', o.sigma);
for (const k of ['false_60_3', 'false_3_3', 'true_170_3']) {
  const x = o[k];
  console.log(k, '-> best', x.best, ' W=' + x.w.toFixed(4));
  console.log('   top:', x.top.map(r => r.k + ':' + r.v).join('  '));
}
