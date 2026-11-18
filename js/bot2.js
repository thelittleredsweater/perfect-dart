'use strict';
/* ============================================================
   bot2 — moteur de bot géométrique « niveau compétition ».
   - Modèle de cible réel (anneaux simples/triples/doubles, bull)
     en millimètres ; l'erreur de visée est un nuage gaussien 2D
     d'écart-type sigma (la difficulté).
   - Solveur de fin de partie : programmation dynamique avec
     continuation sur les visées suivantes (W[d][r]) -> le bot
     choisit toujours la cible qui maximise sa probabilité de
     finir, y compris en préparant le tour suivant.
   - Calibrage : SIGMA_X01 mappe la moyenne 3 fléchettes promise
     (slider 20-120) sur sigma, validé par simulation.
   - Cricket/around : mêmes fondations géométriques.
   Ce fichier est chargé APRES game.js et redéfinit botDart.
   ============================================================ */

/* ---------- cible ---------- */
const B2_SEQ=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const B2_R={bull:6.35,outerBull:15.9,tripleIn:99,tripleOut:107,doubleIn:162,doubleOut:170,board:225.5};
const B2_TARGETS=[];
(function(){
  for(let n=1;n<=20;n++){
    const a=B2_SEQ.indexOf(n)*18*Math.PI/180;
    const cx=Math.sin(a),cy=-Math.cos(a);
    B2_TARGETS.push({k:'S'+n,n,m:1,x:97*cx,y:97*cy});
    B2_TARGETS.push({k:'T'+n,n,m:3,x:103*cx,y:103*cy});
    B2_TARGETS.push({k:'D'+n,n,m:2,x:166*cx,y:166*cy});
  }
  B2_TARGETS.push({k:'25',n:25,m:1,x:0,y:-11});
  B2_TARGETS.push({k:'DB',n:25,m:2,x:0,y:0});
})();
function b2Classify(x,y){
  const r=Math.sqrt(x*x+y*y);
  if(r>B2_R.board)return{base:0,mult:1};
  const ang=(Math.atan2(x,-y)*180/Math.PI+360)%360;
  const idx=Math.abs(Math.round(ang/18))%20;
  const num=B2_SEQ[idx];
  if(r<=B2_R.bull)return{base:25,mult:2};
  if(r<=B2_R.outerBull)return{base:25,mult:1};
  if(r>B2_R.doubleOut)return{base:0,mult:1};
  if(r>B2_R.doubleIn)return{base:num,mult:2};
  if(r>B2_R.tripleOut)return{base:num,mult:1};
  if(r>B2_R.tripleIn)return{base:num,mult:3};
  return{base:num,mult:1};
}
/* gaussien reel (Math.random du contexte, pilotable en tests) pour le TIR */
function b2Gauss(){
  let u=0,v=0;
  do{u=Math.random()}while(u===0);
  v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
/* Deterministe : LCG graine fixe par (cible,sigma) — le solveur doit etre
   repeatable (sinon politique instable sur les marges). */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function gaussFrom(rng){let u=0;do{u=rng()}while(u===0);return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*rng())}
/* Distribution des resultats d'une visee : integratee (MC 400 pts, graine fixe), cachee. */
const b2DistCache={};
function b2Dist(tok,sigma){
  const key=tok+'@'+sigma.toFixed(2);
  if(b2DistCache[key])return b2DistCache[key];
  const t=B2_TARGETS.find(x=>x.k===tok)||B2_TARGETS[0];
  const N=400,rng=mulberry32(hashStr(key)>>>1);
  const acc={};
  for(let i=0;i<N;i++){
    const x=t.x+gaussFrom(rng)*sigma,y=t.y+gaussFrom(rng)*sigma;
    const c=b2Classify(x,y);
    const k=c.base===0?'M':c.base+(c.mult===3?'T':c.mult===2?'D':'S');
    if(!acc[k])acc[k]={base:c.base,mult:c.mult,prob:0};
    acc[k].prob+=1/N;
  }
  const dist=Object.keys(acc).map(k=>acc[k]);
  b2DistCache[key]=dist;
  return dist;
}
/* Une flechette jetee : outcome reel pour le moteur de jeu. */
function b2Dart(tok,sigma){
  const t=B2_TARGETS.find(x=>x.k===tok);
  if(!t)return mkMiss();
  const x=t.x+b2Gauss()*sigma,y=t.y+b2Gauss()*sigma;
  const c=b2Classify(x,y);
  if(c.base===0)return mkMiss();
  return mkDart(c.base,c.mult);
}

/* ---------- solveur X01 ---------- */
/* W[d][r] : probabilite de finir (r restants, d flechettes dans la volee,
   futures visees Same policy). Solution par iterations. */
const b2Policy={};
function b2SigmaOf(level){
  /* table calibree (moyenne/3 -> sigma mm), construite par simulation ;
     interpolation lineaire entre les points. */
  const T=B2_SIGMA;
  if(level<=T[0].avg)return T[0].sigma;
  for(let i=0;i<T.length-1;i++){
    if(level<=T[i+1].avg){
      const f=(level-T[i].avg)/(T[i+1].avg-T[i].avg);
      return T[i].sigma+(T[i+1].sigma-T[i].sigma)*f;
    }
  }
  return T[T.length-1].sigma;
}
function b2PolicyOf(finishDouble,sigma){
  const key=(finishDouble?'D':'S')+sigma.toFixed(1);
  if(b2Policy[key])return b2Policy[key];
  const dists=B2_TARGETS.map(a=>({a,d:b2Dist(a.k,sigma)}));
  const W={1:new Array(171).fill(0),2:new Array(171).fill(0),3:new Array(171).fill(0)};
  const best={1:new Array(171).fill(null),2:new Array(171).fill(null),3:new Array(171).fill(null)};
  /* iterations jusqu'a stabilite : la continuation W[3][r] (nouvelle volee)
     se propage en arriere jusqu'a convergence. */
  for(let it=0;it<24;it++){
    const snap3=W[3].slice();
    _b2pass(W,best,dists,finishDouble);
    let delta=0;
    for(let r=2;r<=170;r++)delta=Math.max(delta,Math.abs(W[3][r]-snap3[r]));
    if(delta<1e-5)break;
  }
  const pol={W,best};
  b2Policy[key]=pol;
  return pol;
}
/* Passe DP : W[d][r] = P(finir CETTE visite) + EPS x qualite de la fin de
   volee (buste ou 3 darts usés : visite suivante, valorisée en Q=W[3] passe
   precedente). Sans le EPS, l'auto-continuation converge vers 1 partout. */
const B2_EPS=0.02;
function _b2pass(W,best,dists,finishDouble){
  const Q=W[3];
  for(let d=1;d<=3;d++){
    const nwd=new Array(171).fill(0);
    const nbest=new Array(171).fill(null);
    for(let r=2;r<=170;r++){
      let bv=-1e-9,bt=null;
      for(let i=0;i<dists.length;i++){
        const a=dists[i].a,dd=dists[i].d;
        let v=0;
        for(let o of dd){
          const vHit=o.base===25?(o.mult===2?50:25):o.base*o.mult;
          if(vHit===r){
            if(!finishDouble||o.mult===2)v+=o.prob;
          }else{
            const rem=r-vHit;
            if(rem<0||(finishDouble&&rem===1))v+=o.prob*B2_EPS*Q[r]; /* bust : visite perdue, peut rejouer */
            else v+=o.prob*(d>1?W[d-1][rem]:B2_EPS*Q[rem]);
          }
        }
        if(v>bv){bv=v;bt=a.k}
      }
      nwd[r]=bv;nbest[r]=bt;
    }
    W[d]=nwd;best[d]=nbest;
  }
}
/* Table sigme calibree : moyenne X01 promise -> sigma (mm). Valeurs issues
   de la simulation des jambes completes double-out (tests/calibrate-one.cjs,
   90-200 jambes par point, metrique = MOY affichee = 3*501/darts). */
const B2_SIGMA=[
  {avg:20,sigma:52.7},{avg:30,sigma:40.8},{avg:40,sigma:24.6},{avg:50,sigma:19.3},
  {avg:60,sigma:16},{avg:70,sigma:13.9},{avg:80,sigma:11.7},{avg:90,sigma:10.1},
  {avg:100,sigma:8.5},{avg:110,sigma:7.4},{avg:120,sigma:6.9}
];

/* ---------- API motrice ---------- */
var BOT2_SIGMA_OVERRIDE=0; /* tests : force sigma en mm */
function botDart2(remaining,used,avg){
  const sigma=(typeof BOT2_SIGMA_OVERRIDE==='number'&&BOT2_SIGMA_OVERRIDE>0)?BOT2_SIGMA_OVERRIDE:b2SigmaOf(avg);
  const r=Math.max(0,Math.round(remaining));
  if(r<=170){
    const pol=b2PolicyOf(STATE.finishDouble,sigma);
    const dartsLeft=3-Math.max(0,Math.min(2,used));
    const tok=pol.best[dartsLeft]&&pol.best[dartsLeft][r];
    if(tok)return b2Dart(tok,sigma);
  }
  /* au-dela de 170 : viser T20 */
  return b2Dart('T20',sigma);
}
var BOT2_SIGMA_OVERRIDE=0;
/* Bot around : geometry sur la cible courante. */
function botAround2(avg,target){
  const need=STATE.aroundVariant||1;
  const sigma=b2SigmaOf(avg)*1.15;
  const tok=(target>20?'DB':(need===3?'T':need===2?'D':'S')+target);
  return b2Dart(tok,sigma);
}
/* Bot cricket : cible choisie par heuristique, jet geométrique. */
function botCricket2(avg){
  const idx=STATE.currentPlayer,marks=STATE.cricketMarks[idx]||{};
  const targets=[20,19,18,17,16,15,25];
  const oppOpen=t=>STATE.players.some((p,i)=>i!==idx&&(STATE.cricketMarks[i][t]||0)<3);
  /* Priorite : 1) fermer une cible ouverte chez lui ET l'adversaire (progres + marquage),
     2) fermer une cible ouverte chez lui (sans quoi la partie ne se termine jamais),
     3) tout est ferme chez lui -> marquer sur les cibles adverses ouvertes. */
  const nonBull=t=>t!==25?0:1;
  const ownOpen=[20,19,18,17,16,15,25].filter(t=>(marks[t]||0)<3).sort((a,b)=>nonBull(a)-nonBull(b));
  const bothOpen=ownOpen.filter(oppOpen);
  let target;
  if(bothOpen.length)target=bothOpen[0];
  else if(ownOpen.length)target=ownOpen[0];
  else{
    const scoring=[20,19,18,17,16,15,25].filter(t=>oppOpen(t)&&!ownOpen.includes(t));
    target=scoring.length?scoring[0]:25;
  }
  const sigma=b2SigmaOf(avg)*1.3;
  const tok=target===25?'DB':(target===20?'T20':'T'+target);
  return b2Dart(tok,sigma);
}
/* Remplacement de botDart (game.js) et des bots cricket/around. */
const b2_prevDart=botDart;
botDart=function(remaining,used,avg){return botDart2(remaining,used,avg)};
const b2_prevCricket=botCricketDart;
botCricketDart=function(avg){return botCricket2(avg)};
const b2_prevAround=simulateAroundDart;
simulateAroundDart=function(avg,target){return botAround2(avg,target)};
