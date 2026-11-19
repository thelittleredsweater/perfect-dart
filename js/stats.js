'use strict';
/* ============================================================
   Statistiques (carrière).
   localStorage[CAREER_KEY] = {
     profiles: { nom: cumuls toutes parties (games, wins, scored, darts, ...) },
     history : [ { date, mode, winner, players:[{name, score, isBot, st}] } ]  (300 max)
     dbl     : { nom: { seg: [tentatives, réussis] } }   (coach.js)
     hits    : { nom: { base: [simples, doubles, triples] } }  (0 = manqué)
     ghosts  : ...  (coach.js)
   }
   st = stats brutes d'un joueur sur une partie, pour les filtres de période.
   ============================================================ */
function loadCareer(){try{const raw=localStorage.getItem(CAREER_KEY);if(raw){const c=JSON.parse(raw);if(c&&c.profiles){c.history=c.history||[];return c}}}catch(e){}return{profiles:{},history:[]}}
function saveCareer(c){try{localStorage.setItem(CAREER_KEY,JSON.stringify(c))}catch(e){}}
function profileNames(){return Object.keys(loadCareer().profiles).sort()}

const VISIT_BINS=[{min:180,l:'180'},{min:140,l:'140–179'},{min:100,l:'100–139'},{min:60,l:'60–99'},{min:40,l:'40–59'},{min:20,l:'20–39'},{min:0,l:'0–19'}];
function visitBin(v){for(let i=0;i<VISIT_BINS.length;i++)if(v>=VISIT_BINS[i].min)return i;return VISIT_BINS.length-1}

/* Stats brutes d'un joueur pour la partie qui se termine. */
function playerMatchStats(p,idx,won){
  const x01=typeof STATE.mode==='number';
  const st={won:won?1:0,legs:p.legsTotal||0,best:p.bestTurn||0};
  if(x01){
    Object.assign(st,{sc:p.totalScored||0,dt:p.dartsThrown||0,dh:p.doublesHit||0,da:p.doublesAttempted||0,co:p.checkouts||0,
      c180:p.count180||0,c140:p.count140||0,c100:p.count100||0,c60:p.count60||0,bust:p.busts||0,hiCo:p.hiCo||0,bl:p.bestLeg||0});
    if((p.dartsThrown||0)>=9)st.f9=p.first9||0;
    st.bk=VISIT_BINS.map(()=>0);(p.turnHistory||[]).forEach(v=>st.bk[visitBin(v)]++);
  }
  if(STATE.mode==='cricket'&&STATE.cricketMarks&&STATE.cricketMarks[idx]){
    st.mk=Object.values(STATE.cricketMarks[idx]).reduce((s,v)=>s+Math.min(v,3),0);st.rd=p.turns||0;
  }
  return st;
}
function recordGameToCareer(winner,meta){
  const c=loadCareer();const x01=typeof STATE.mode==='number';
  const sts=STATE.players.map((p,idx)=>playerMatchStats(p,idx,p===winner));
  STATE.lastRecords=newRecords(c,sts);
  STATE.players.forEach((p,idx)=>{
    const name=p.name,st=sts[idx];
    const pr=c.profiles[name]=c.profiles[name]||{games:0,wins:0,scored:0,darts:0,bestTurn:0,c180:0,c140:0,c100:0,busts:0,dblHit:0,dblAtt:0,checkouts:0,f9sum:0,f9n:0,marks:0,rounds:0};
    pr.games++;if(p===winner)pr.wins++;
    pr.bestTurn=Math.max(pr.bestTurn,p.bestTurn||0);
    /* Moyennes : X01 uniquement (le Cricket ou le Shanghai fausseraient la moyenne). */
    if(x01){
      pr.scored+=st.sc;pr.darts+=st.dt;pr.c180+=st.c180;pr.c140+=st.c140;pr.c100+=st.c100;pr.c60=(pr.c60||0)+st.c60;
      pr.busts+=st.bust;pr.dblHit+=st.dh;pr.dblAtt+=st.da;pr.checkouts+=st.co;
      /* First 9 : une contribution par partie jouee avec 9+ flechettes lancees. */
      if(st.f9!=null){pr.f9sum+=st.f9;pr.f9n++}
      pr.hiCo=Math.max(pr.hiCo||0,st.hiCo);if(st.bl&&(!pr.bestLeg||st.bl<pr.bestLeg))pr.bestLeg=st.bl;
      if(st.dt>=9)pr.bestAvg=Math.max(pr.bestAvg||0,Math.round(30*st.sc/st.dt)/10);
      pr.max180=Math.max(pr.max180||0,st.c180);
      pr.bk=pr.bk||VISIT_BINS.map(()=>0);st.bk.forEach((n,i)=>{pr.bk[i]+=n});
    }
    /* MPR cricket : marques totales / tours. */
    if(st.mk!=null){pr.marks+=st.mk;pr.rounds+=st.rd}
  });
  c.history.unshift({date:new Date().toISOString(),mode:STATE.mode,finishDouble:STATE.finishDouble,winner:winner.name,durationSec:meta.duration,
    legsBestOf:STATE.legsBestOf||1,setsBestOf:STATE.setsBestOf||1,
    players:STATE.players.map((p,i)=>({name:p.name,score:p.score,isBot:p.isBot,legs:p.legsTotal||0,sets:p.sets||0,st:sts[i]}))});
  if(c.history.length>300)c.history.length=300;
  saveCareer(c);
}
/* Records personnels battus pendant cette partie (avant mise à jour du profil).
   Rien à la toute première partie d'un joueur : tout serait « record ». */
function newRecords(c,sts){
  const out=[];
  STATE.players.forEach((p,i)=>{
    const pr=c.profiles[p.name],st=sts[i];if(p.isBot||!pr||!pr.games)return;
    const r=[];
    if(st.dt>=9&&pr.darts){const avg=Math.round(30*st.sc/st.dt)/10;if(avg>(pr.bestAvg||0))r.push({l:'Meilleure moyenne',v:fmtN(avg)})}
    if(st.hiCo&&st.hiCo>(pr.hiCo||0)&&pr.darts)r.push({l:'Plus haut checkout',v:st.hiCo});
    if(st.bl&&pr.darts&&(!pr.bestLeg||st.bl<pr.bestLeg))r.push({l:'Meilleur leg',v:st.bl+' fléchettes'});
    if(st.best>(pr.bestTurn||0))r.push({l:'Meilleure volée',v:st.best});
    if(st.c180&&st.c180>(pr.max180||0)&&pr.darts)r.push({l:'Max de 180 en une partie',v:st.c180});
    if(r.length)out.push({name:p.name,r});
  });
  return out;
}
function renderNewRecords(){
  const el=document.getElementById('winnerRecords');if(!el)return;
  const recs=STATE.lastRecords||[];
  el.innerHTML=recs.map(x=>`<div class="wr-card"><div class="wr-head">🏆 ${x.r.length>1?'Nouveaux records':'Nouveau record'} · ${escapeHtml(x.name)}</div>${x.r.map(r=>`<div class="wr-row"><span>${r.l}</span><b>${r.v}</b></div>`).join('')}</div>`).join('');
  el.style.display=recs.length?'':'none';
}
/* ================== Entraînements ==================
   c.training[nom][mode] = [{t, v, ok, x}] (du plus récent au plus ancien, 100 max). */
const TRAINING_MODES={
  bobs27:{l:"Bob's 27",u:'pts',v:p=>Math.max(0,p.score)},
  doubles:{l:'Doubles aléatoires',u:'%',v:()=>{const ms=STATE.ms||{};return Math.round(100*(ms.hits||0)/(DOUBLES_ROUNDS*3))}},
  co121:{l:'121 Checkout',u:'finishs',v:()=>(STATE.ms&&STATE.ms.success)||0,x:()=>(STATE.ms&&STATE.ms.best)||0},
  catch40:{l:'Catch 40',u:'pts',v:p=>p.score},
  highscore:{l:'Highscore',u:'pts',v:p=>p.score},
};
function recordTraining(player,success){
  STATE.lastRecords=[];
  const def=TRAINING_MODES[STATE.mode];if(!def||!player||player.isBot)return;
  const c=loadCareer();c.training=c.training||{};
  const mine=c.training[player.name]=c.training[player.name]||{};
  const list=mine[STATE.mode]=mine[STATE.mode]||[];
  const v=def.v(player),e={t:Date.now(),v,ok:success?1:0};if(def.x)e.x=def.x(player);
  if(list.length&&v>Math.max(...list.map(z=>z.v)))STATE.lastRecords=[{name:player.name,r:[{l:'Record '+def.l,v:v+' '+def.u}]}];
  list.unshift(e);if(list.length>100)list.length=100;
  saveCareer(c);
}
function trainingCard(c,name,from){
  const mine=(c.training&&c.training[name])||{};
  const rows=Object.keys(TRAINING_MODES).map(k=>{const all=(mine[k]||[]).filter(e=>!from||e.t>=from);if(!all.length)return'';
    const d=TRAINING_MODES[k],vals=all.map(e=>e.v),best=Math.max(...vals),last5=vals.slice(0,5),avg=Math.round(10*last5.reduce((a,b)=>a+b,0)/last5.length)/10;
    return `<div class="tr-row"><div class="tr-h"><b>${d.l}</b><small>${all.length} séance${all.length>1?'s':''}</small></div>
      <div class="tr-k"><div><span>${best}</span><small>record</small></div><div><span>${vals[0]}</span><small>dernière</small></div><div><span>${fmtN(avg)}</span><small>moy. 5 dern.</small></div></div>${sparkline(vals.slice(0,20).reverse())}</div>`}).join('');
  if(!rows)return'';
  return `<div class="card sd-card"><div class="chart-title">🏋️ Entraînements</div>${rows}</div>`;
}
function sparkline(v){
  if(v.length<2)return'';const W=300,H=36,lo=Math.min(...v),hi=Math.max(...v),sp=hi-lo||1;
  const pts=v.map((x,i)=>`${(W*i/(v.length-1)).toFixed(1)},${(H-3-(H-6)*(x-lo)/sp).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
}
/* Impacts par segment (heatmap) : comptés à chaque volée, cumulés en fin de partie. */
function tallyHits(p){
  if(!p)return;p.hits=p.hits||{};
  (STATE.dartsThisTurn||[]).forEach(d=>{if(d.ndarts||d.baseValue<0)return;const k=d.baseValue===0?0:d.baseValue;const a=p.hits[k]=p.hits[k]||[0,0,0];a[Math.min(Math.max(d.mult||1,1),3)-1]++});
}
function saveHitStats(){
  const c=loadCareer();c.hits=c.hits||{};
  STATE.players.forEach(p=>{
    if(p.isBot||!p.hits||p.hitsSaved)return;
    const dst=c.hits[p.name]=c.hits[p.name]||{};
    Object.keys(p.hits).forEach(k=>{const a=dst[k]=dst[k]||[0,0,0];p.hits[k].forEach((n,i)=>{a[i]+=n})});
    p.hitsSaved=true;
  });
  saveCareer(c);
}

function avg3(p){return p.darts?Math.round(3*p.scored/p.darts):0}
function dblPct(p){return p.dblAtt?Math.round(100*p.dblHit/p.dblAtt):0}
/* First 9 moyen (par volée de 3) et MPR moyens sur la carrière. */
function f9AvgOf(p){return p&&p.f9n?Math.round(10*p.f9sum/(3*p.f9n))/10:null}
function mprOf(p){return p&&p.rounds?Math.round(10*p.marks/p.rounds)/10:null}
/* Synthese d'une partie terminee pour un joueur (overlay + partage). */
function matchSummary(p){
  const visits=(p.dartsThrown||0)/3||p.turns||0;
  const scoredVisits=(p.turnHistory||[]).filter(v=>v>0);
  return{
    avg:visits?Math.round((p.totalScored||0)/visits):0,
    first9:(p.dartsThrown||0)>=9?Math.round(10*(p.first9||0)/3)/10:null,
    best:p.bestTurn||0,
    worst:scoredVisits.length?Math.min.apply(null,scoredVisits):null,
    dbl:(p.doublesAttempted||0)?Math.round(100*p.doublesHit/p.doublesAttempted):0,
    checkouts:p.checkouts||0,busts:p.busts||0,
    c180:p.count180||0,c140:p.count140||0,c100:p.count100||0,c60:p.count60||0,
    mpr:p.mpr!=null?p.mpr:null,
  };
}
function matchSummaryText(p,header){
  const s=matchSummary(p);
  const lines=[header||'Perfect Darts'];
  lines.push('Moyenne / volée : '+s.avg);
  if(s.first9!=null)lines.push('First 9 : '+s.first9);
  if(s.mpr!=null)lines.push('MPR : '+s.mpr);
  lines.push('Meilleure volée : '+s.best+(s.worst!=null?' · pire volée : '+s.worst:''));
  lines.push('Doubles : '+s.dbl+'% · Checkouts : '+s.checkouts+' · Busts : '+s.busts);
  lines.push('180 : '+s.c180+' · 140+ : '+s.c140+' · 100+ : '+s.c100+' · 60+ : '+s.c60);
  return lines.join('\n');
}

/* ================== Agrégation ================== */
const STATS_PERIODS=[{d:7,l:'7 j'},{d:30,l:'30 j'},{d:90,l:'3 mois'},{d:0,l:'Tout'}];
const STATS_UI={view:'player',player:'',period:3,metric:'avg',heat:'hits',open:-1};
try{const s=JSON.parse(localStorage.getItem('pd_stats_ui')||'{}');['view','player','period','metric','heat'].forEach(k=>{if(s[k]!=null)STATS_UI[k]=s[k]})}catch(e){}
function statsUiSave(){try{localStorage.setItem('pd_stats_ui',JSON.stringify(STATS_UI))}catch(e){}}

/* Parties d'un joueur, de la plus récente à la plus ancienne, dans [from, to[. */
function playerGames(c,name,from,to){
  const out=[];
  c.history.forEach(h=>{const t=Date.parse(h.date);if((from&&t<from)||(to&&t>=to))return;const me=h.players.find(p=>p.name===name);if(me)out.push({h,me,t,won:h.winner===name})});
  return out;
}
function aggGames(list){
  const a={games:list.length,wins:0,sc:0,dt:0,f9:0,f9n:0,dh:0,da:0,co:0,c180:0,c140:0,c100:0,c60:0,bust:0,hiCo:0,bl:0,best:0,bestAvg:0,max180:0,mk:0,rd:0,x01:0,crk:0,bk:VISIT_BINS.map(()=>0)};
  list.forEach(g=>{
    if(g.won)a.wins++;const st=g.me.st;if(!st)return;
    a.best=Math.max(a.best,st.best||0);
    if(st.dt!=null){a.x01++;a.sc+=st.sc;a.dt+=st.dt;a.dh+=st.dh;a.da+=st.da;a.co+=st.co;a.c180+=st.c180;a.c140+=st.c140;a.c100+=st.c100;a.c60+=st.c60;a.bust+=st.bust;
      if(st.f9!=null){a.f9+=st.f9;a.f9n++}
      a.hiCo=Math.max(a.hiCo,st.hiCo||0);if(st.bl&&(!a.bl||st.bl<a.bl))a.bl=st.bl;
      if(st.dt>=9)a.bestAvg=Math.max(a.bestAvg,Math.round(30*st.sc/st.dt)/10);
      a.max180=Math.max(a.max180,st.c180);(st.bk||[]).forEach((n,i)=>{a.bk[i]+=n})}
    if(st.mk!=null){a.crk++;a.mk+=st.mk;a.rd+=st.rd}
  });
  return a;
}
/* Parties d'avant la v1.7 (sans détail) : on reprend les cumuls du profil pour « Tout ». */
function aggFromProfile(pr,a){
  if(!pr)return a;
  const legacy=(pr.games||0)-a.games;if(legacy<=0)return a;
  return Object.assign({},a,{games:pr.games,wins:pr.wins,sc:pr.scored,dt:pr.darts,f9:pr.f9sum,f9n:pr.f9n,dh:pr.dblHit,da:pr.dblAtt,co:pr.checkouts,
    c180:pr.c180,c140:pr.c140,c100:pr.c100,c60:pr.c60||a.c60,bust:pr.busts,hiCo:Math.max(pr.hiCo||0,a.hiCo),bl:pr.bestLeg||a.bl,best:Math.max(pr.bestTurn||0,a.best),
    bestAvg:Math.max(pr.bestAvg||0,a.bestAvg),max180:Math.max(pr.max180||0,a.max180),mk:pr.marks,rd:pr.rounds,bk:pr.bk||a.bk,x01:Math.max(a.x01,pr.darts?1:0),crk:Math.max(a.crk,pr.rounds?1:0),legacy});
}
const kAvg=a=>a.dt?Math.round(30*a.sc/a.dt)/10:null;
const kF9=a=>a.f9n?Math.round(10*a.f9/(3*a.f9n))/10:null;
const kDbl=a=>a.da?Math.round(100*a.dh/a.da):null;
const kMpr=a=>a.rd?Math.round(10*a.mk/a.rd)/10:null;
const kWin=a=>a.games?Math.round(100*a.wins/a.games):null;

/* ================== Rendu ================== */
function renderStatsScreen(){
  const c=loadCareer();
  const names=Object.keys(c.profiles).sort((a,b)=>{const pa=c.profiles[a],pb=c.profiles[b];return pb.games-pa.games||a.localeCompare(b)});
  const humans=names.filter(n=>!isBotName(c,n));
  if(!humans.includes(STATS_UI.player))STATS_UI.player=humans[0]||names[0]||'';
  const tabs=document.getElementById('statsTabs');
  if(tabs)tabs.innerHTML=[['player','👤 Joueur'],['rank','🏅 Classement'],['hist','🕑 Historique']].map(([k,l])=>`<button type="button" class="sv-tab${STATS_UI.view===k?' on':''}" onclick="statsView('${k}')">${l}</button>`).join('');
  ['statsPlayer','statsRank','statsHist'].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.style.display=(['player','rank','hist'][i]===STATS_UI.view)?'':'none'});
  renderRanking(c,names);
  renderPlayerDash(c,humans.length?humans:names);
  renderHistory(c);
}
function isBotName(c,n){return c.history.some(h=>h.players.some(p=>p.name===n&&p.isBot))&&!c.history.some(h=>h.players.some(p=>p.name===n&&!p.isBot))}
function statsView(v){STATS_UI.view=v;statsUiSave();renderStatsScreen();const s=document.getElementById('screenStats');if(s)s.scrollTop=0}
function statsPick(k,v){STATS_UI[k]=v;statsUiSave();renderStatsScreen()}
function statsOpenPlayer(n){STATS_UI.player=n;STATS_UI.view='player';statsUiSave();renderStatsScreen()}

function renderRanking(c,names){
  const wrap=document.getElementById('statsProfiles');if(!wrap)return;
  if(!names.length){wrap.innerHTML='<div class="empty-note">Aucune partie enregistrée pour l\'instant.<br>Jouez une partie : les stats s\'accumulent ici.</div>';return}
  const rows=names.slice().sort((a,b)=>c.profiles[b].wins-c.profiles[a].wins||c.profiles[b].games-c.profiles[a].games);
  wrap.innerHTML='<table class="stats-table rank-table"><thead><tr><th>Joueur</th><th>J</th><th>V</th><th>Moy/3</th><th>F9</th><th>Meil.</th><th>180</th><th>DBL%</th><th>MPR</th></tr></thead><tbody>'+rows.map(n=>{const p=c.profiles[n];const f9=f9AvgOf(p);const mpr=mprOf(p);
    return `<tr onclick="statsOpenPlayer(this.dataset.n)" data-n="${escapeHtml(n)}"><td>${escapeHtml(n)}</td><td>${p.games}</td><td>${p.wins}</td><td><b>${p.darts?avg3(p):'—'}</b></td><td>${f9==null?'—':f9}</td><td>${p.bestTurn}</td><td>${p.c180}</td><td>${p.dblAtt?dblPct(p)+'%':'—'}</td><td>${mpr==null?'—':mpr}</td></tr>`}).join('')+'</tbody></table><div class="sd-note">Touchez un joueur pour voir son tableau de bord.</div>';
  /* Coach : meilleurs doubles de chaque joueur (parties + entraînements). */
  const dn=Object.keys(c.dbl||{}).filter(n=>bestDoubles(n,3).length);
  if(dn.length)wrap.innerHTML+='<div class="coach-dbl"><div class="label" style="margin:14px 0 6px">🎯 Doubles préférés (coach)</div>'+dn.map(n=>'<div class="coach-row"><b>'+escapeHtml(n)+'</b> · '+bestDoubles(n,3).map(d=>(d.seg===25?'Bull':'D'+d.seg)+' '+d.pct+' %').join(' · ')+'</div>').join('')+'</div>';
}

function fmtN(v,suf){return v==null?'—':String(v).replace('.',',')+(suf||'')}
function deltaHtml(cur,prev,suf){
  if(cur==null||prev==null)return'';const d=Math.round(10*(cur-prev))/10;if(!d)return'<span class="kd eq">= période préc.</span>';
  return `<span class="kd ${d>0?'up':'down'}">${d>0?'▲':'▼'} ${fmtN(Math.abs(d),suf)}</span>`;
}
function renderPlayerDash(c,names){
  const box=document.getElementById('statsPlayer');if(!box)return;
  if(!names.length){box.innerHTML='<div class="card"><div class="empty-note">Aucune partie enregistrée pour l\'instant.<br>Jouez une partie : votre tableau de bord se remplit ici.</div></div>';return}
  const name=STATS_UI.player,per=STATS_PERIODS[STATS_UI.period]||STATS_PERIODS[3],now=Date.now();
  const from=per.d?now-per.d*864e5:0;
  const games=playerGames(c,name,from,0);
  let a=aggGames(games);if(!per.d)a=aggFromProfile(c.profiles[name],a);
  const prev=per.d?aggGames(playerGames(c,name,from-per.d*864e5,from)):null;
  const chips=`<div class="sd-chips" role="tablist">${names.map(n=>`<button type="button" class="sd-chip${n===name?' on':''}" data-n="${escapeHtml(n)}" onclick="statsPick('player',this.dataset.n)">${escapeHtml(n)}</button>`).join('')}</div>`;
  const pers=`<div class="sd-seg">${STATS_PERIODS.map((p,i)=>`<button type="button" class="${i===STATS_UI.period?'on':''}" onclick="statsPick('period',${i})">${p.l}</button>`).join('')}</div>`;
  if(!a.games){box.innerHTML=chips+pers+(trainingCard(c,name,from)||'<div class="card"><div class="empty-note">Aucune partie sur cette période.</div></div>');return}
  const tile=(v,l,sub,cls)=>`<div class="kpi${cls?' '+cls:''}"><div class="kv">${v}</div><div class="kl">${l}</div>${sub||''}</div>`;
  const hero=`<div class="kpi-grid${a.rd?' n5':''}">
    ${tile(fmtN(kAvg(a)),'Moyenne 3 fl.',deltaHtml(kAvg(a),prev&&kAvg(prev)),'hero')}
    ${tile(fmtN(kF9(a)),'First 9',deltaHtml(kF9(a),prev&&kF9(prev)))}
    ${tile(fmtN(kDbl(a),' %'),'Réussite doubles',`<span class="ks">${a.dh} / ${a.da}</span>`)}
    ${tile(fmtN(kWin(a),' %'),'Victoires',`<span class="ks">${a.wins} / ${a.games} parties</span>`)}
    ${a.rd?tile(fmtN(kMpr(a)),'MPR Cricket',deltaHtml(kMpr(a),prev&&kMpr(prev))):''}
  </div>`;
  const recs=[[a.bestAvg?fmtN(a.bestAvg):'—','Meilleure moyenne'],[a.hiCo||'—','Plus haut checkout'],[a.bl?a.bl+' fl.':'—','Meilleur leg'],[a.best||'—','Meilleure volée'],[a.max180||'0','Max 180 / partie'],[a.co||'0','Checkouts']];
  const records=`<div class="card sd-card"><div class="chart-title">🏆 Records${per.d?' · '+per.l:''}</div><div class="rec-grid">${recs.map(r=>`<div class="rec"><div class="rv">${r[0]}</div><div class="rl">${r[1]}</div></div>`).join('')}</div></div>`;
  box.innerHTML=chips+pers+hero+
    `<div class="sd-cols"><div class="sd-col">${trendCard(games,a)}${records}${scoringCard(a)}</div>`+
    `<div class="sd-col">${heatCard(c,name)}${trainingCard(c,name,from)}${h2hCard(c,name,games)}</div></div>`+
    (a.legacy?`<div class="sd-note">${a.legacy} partie${a.legacy>1?'s':''} jouée${a.legacy>1?'s':''} avant cette version : comptée${a.legacy>1?'s':''} dans les totaux, sans courbe ni détail.</div>`:'');
}

/* Progression : une valeur par partie, + moyenne glissante sur 5 parties. */
const TREND_METRICS=[
  {k:'avg',l:'Moyenne',f:st=>st.dt>=3?Math.round(30*st.sc/st.dt)/10:null},
  {k:'f9',l:'First 9',f:st=>st.f9!=null?Math.round(10*st.f9/3)/10:null},
  {k:'dbl',l:'Doubles %',f:st=>st.da?Math.round(100*st.dh/st.da):null,suf:' %'},
  {k:'mpr',l:'MPR',f:st=>st.rd?Math.round(10*st.mk/st.rd)/10:null},
];
function trendCard(games){
  const series=TREND_METRICS.map(m=>({m,pts:games.filter(g=>g.me.st).map(g=>({t:g.t,v:m.f(g.me.st),won:g.won})).filter(p=>p.v!=null).reverse()}));
  const avail=series.filter(s=>s.pts.length);
  if(!avail.length)return'';
  let cur=avail.find(s=>s.m.k===STATS_UI.metric)||avail[0];
  const sw=`<div class="sd-seg sm">${avail.map(s=>`<button type="button" class="${s===cur?'on':''}" onclick="statsPick('metric','${s.m.k}')">${s.m.l}</button>`).join('')}</div>`;
  const pts=cur.pts.slice(-40);
  return `<div class="card sd-card"><div class="chart-title">📈 Progression · ${pts.length} partie${pts.length>1?'s':''}</div>${sw}${trendSvg(pts,cur.m)}<div class="tr-leg"><span><i class="lg-pt"></i>par partie</span><span><i class="lg-ma"></i>moyenne sur 5</span><span><i class="lg-won"></i>victoire</span></div></div>`;
}
function trendSvg(pts,m){
  /* viewBox à la taille réelle de la carte : textes non déformés. */
  const bw=(document.getElementById('statsPlayer')||{}).clientWidth||0,wide=typeof innerWidth==='number'&&innerWidth>=760;
  const W=Math.max(280,Math.round(wide?(bw-14)*1.25/2.25-34:bw-34))||600,H=wide?(innerHeight>=800&&innerWidth>=1400?300:240):190,L=34,R=10,T=12,B=24;
  if(pts.length<2)return `<div class="empty-note">Encore ${2-pts.length} partie pour tracer la courbe (${fmtN(pts[0].v,m.suf)} pour l'instant).</div>`;
  const vs=pts.map(p=>p.v);let lo=Math.min(...vs),hi=Math.max(...vs);
  const span=Math.max(hi-lo,m.k==='mpr'?1:10);lo=Math.max(0,lo-span*.15);hi=hi+span*.15;
  const step=niceStep((hi-lo)/4);lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
  const x=i=>L+(W-L-R)*i/(pts.length-1),y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo||1));
  let g='';
  for(let v=lo;v<=hi+1e-9;v+=step){const yy=y(v).toFixed(1);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="tg"/><text x="${L-6}" y="${(+yy+4).toFixed(1)}" class="tt" text-anchor="end">${Math.round(v*10)/10}</text>`}
  const ma=pts.map((p,i)=>{const s=pts.slice(Math.max(0,i-4),i+1);return s.reduce((t,q)=>t+q.v,0)/s.length});
  const line=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area=line+`L${x(pts.length-1).toFixed(1)},${H-B}L${L},${H-B}Z`;
  const maL=ma.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const dots=pts.map((p,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${pts.length>25?3:4.5}" class="${p.won?'td won':'td'}"><title>${new Date(p.t).toLocaleDateString('fr-FR')} : ${fmtN(p.v,m.suf)}</title></circle>`).join('');
  const d0=new Date(pts[0].t).toLocaleDateString('fr-FR',{day:'numeric',month:'short'}),d1=new Date(pts[pts.length-1].t).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
  const last=pts[pts.length-1].v;
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px" role="img" aria-label="Progression ${m.l}">${g}<path d="${area}" class="ta"/><path d="${line}" class="tl"/><path d="${maL}" class="tm"/>${dots}<text x="${L}" y="${H-6}" class="tt">${d0}</text><text x="${W-R}" y="${H-6}" class="tt" text-anchor="end">${d1}</text></svg><div class="tr-last">Dernière partie : <b>${fmtN(last,m.suf)}</b> · moyenne glissante <b>${fmtN(Math.round(ma[ma.length-1]*10)/10,m.suf)}</b></div>`;
}
function niceStep(raw){const p=Math.pow(10,Math.floor(Math.log10(raw||1)));const n=raw/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}

function scoringCard(a){
  const visits=a.bk.reduce((s,n)=>s+n,0);
  if(!a.x01)return'';
  const per=a.games?'':'';
  const counts=`<div class="sc-counts">${[['180',a.c180],['140+',a.c140],['100+',a.c100],['60+',a.c60]].map(([l,n])=>`<div class="scc"><div class="sv">${n||0}</div><div class="sl">${l}</div></div>`).join('')}</div>`;
  if(!visits)return `<div class="card sd-card"><div class="chart-title">🎯 Scoring</div>${counts}${per}</div>`;
  const mx=Math.max(...a.bk);
  const bars=VISIT_BINS.map((b,i)=>{const n=a.bk[i],pc=Math.round(100*n/visits);return `<div class="hb"><span class="hl">${b.l}</span><span class="ht"><i style="width:${mx?Math.max(n?2:0,100*n/mx):0}%"></i></span><span class="hv">${pc} %</span></div>`}).join('');
  return `<div class="card sd-card"><div class="chart-title">🎯 Scoring · ${visits} volées</div>${counts}<div class="hbars">${bars}</div><div class="sd-note">Busts : ${a.bust||0} · checkouts : ${a.co||0}</div></div>`;
}

/* Heatmap : impacts par segment (toutes fléchettes) ou réussite par double. */
function heatCard(c,name){
  const hits=(c.hits&&c.hits[name])||{},dbl=(c.dbl&&c.dbl[name])||{};
  const total=Object.values(hits).reduce((s,a)=>s+a[0]+a[1]+a[2],0);
  const hasDbl=Object.keys(dbl).length>0;
  if(!total&&!hasDbl)return `<div class="card sd-card"><div class="chart-title">🔥 Heatmap de la cible</div><div class="empty-note">Saisissez vos fléchettes une par une (pavé ou cible) : la carte de vos impacts se dessine ici.</div></div>`;
  let mode=STATS_UI.heat;if(mode==='hits'&&!total)mode='dbl';if(mode==='dbl'&&!hasDbl)mode='hits';
  const sw=total&&hasDbl?`<div class="sd-seg sm"><button type="button" class="${mode==='hits'?'on':''}" onclick="statsPick('heat','hits')">Impacts</button><button type="button" class="${mode==='dbl'?'on':''}" onclick="statsPick('heat','dbl')">Doubles %</button></div>`:'';
  let svg,info;
  if(mode==='hits'){
    let mx=0;const val=(b,m)=>{const a=hits[b];return a?a[m-1]:0};
    SECTORS.concat([25]).forEach(b=>[1,2,3].forEach(m=>{mx=Math.max(mx,m===1&&b!==25?val(b,1)/2:val(b,m))}));
    /* simples : 2 zones par secteur, on répartit le compte pour garder une échelle juste */
    const col=(b,m)=>{const v=m===1&&b!==25?val(b,1)/2:val(b,m);return heatColor(mx?v/mx:0)};
    const tip=(b,m)=>{const n=val(b,m);return `${segName(b,m)} : ${n} fléchette${n>1?'s':''} (${total?Math.round(100*n/total):0} %)`};
    svg=heatBoard(col,tip);
    const top=[];Object.keys(hits).forEach(k=>{if(+k===0)return;hits[k].forEach((n,i)=>{if(n)top.push({b:+k,m:i+1,n})})});top.sort((p,q)=>q.n-p.n);
    const miss=hits[0]?hits[0][0]:0;
    info=`<div class="hm-top">${top.slice(0,5).map(t=>`<span class="hm-chip"><b>${segName(t.b,t.m)}</b> ${Math.round(100*t.n/total)} %</span>`).join('')}${miss?`<span class="hm-chip miss"><b>Hors cible</b> ${Math.round(100*miss/total)} %</span>`:''}</div><div class="hm-scale"><span>rare</span><i class="hit"></i><span>fréquent</span></div><div class="sd-note">${total} fléchettes saisies une par une</div>`;
  }else{
    const col=(b,m)=>{if(m!==2)return'var(--hm-off)';const a=dbl[b];if(!a||!a[0])return'var(--hm-off)';return dblColor(a[1]/a[0])};
    const tip=(b,m)=>{const a=dbl[b];return m===2&&a?`${segName(b,2)} : ${a[1]} / ${a[0]} (${Math.round(100*a[1]/a[0])} %)`:segName(b,m)};
    svg=heatBoard(col,tip,true);
    const list=Object.keys(dbl).map(k=>({b:+k,a:dbl[k]})).filter(d=>d.a[0]>=1).sort((p,q)=>q.a[1]/q.a[0]-p.a[1]/p.a[0]||q.a[0]-p.a[0]);
    info=`<div class="hm-top">${list.slice(0,6).map(d=>`<span class="hm-chip"><b>${segName(d.b,2)}</b> ${Math.round(100*d.a[1]/d.a[0])} % <small>(${d.a[1]}/${d.a[0]})</small></span>`).join('')}</div><div class="hm-scale"><span>0 %</span><i class="dbl"></i><span>50 %+</span></div>`;
  }
  return `<div class="card sd-card"><div class="chart-title">🔥 Heatmap de la cible</div>${sw}<div class="hm-wrap">${svg}</div><div class="hm-tip" id="hmTip">Touchez une zone pour le détail.</div>${info}</div>`;
}
function segName(b,m){if(b===25)return m===2?'Bull 50':'Bull 25';return (m===3?'T':m===2?'D':'S')+b}
function heatColor(t){if(t<=0)return'var(--hm-off)';const s=Math.sqrt(t);const h=Math.round(220-200*s),l=Math.round(28+30*s);return `hsl(${h},85%,${l}%)`}
function dblColor(r){const t=Math.min(1,r/0.5);return `hsl(${Math.round(4+128*t)},75%,${Math.round(40+8*t)}%)`}
function heatBoard(col,tip,dimSingles){
  const cx=350,cy=350,RI=22,RB=55,T1=157,T2=200,D1=255,E=312,TX=334;
  const p=[];const seg=(d,b,m)=>`<path d="${d}" fill="${col(b,m)}" data-tip="${escapeHtml(tip(b,m))}"/>`;
  p.push(`<circle cx="${cx}" cy="${cy}" r="350" class="hm-bg"/>`);
  for(let i=0;i<20;i++){const a=-99+i*18,b=a+18,v=SECTORS[i];
    p.push(seg(ringSector(cx,cy,RB,T1,a,b),v,1),seg(ringSector(cx,cy,T1,T2,a,b),v,3),seg(ringSector(cx,cy,T2,D1,a,b),v,1),seg(ringSector(cx,cy,D1,E,a,b),v,2));
    const ang=(a+9)*Math.PI/180;p.push(`<text x="${(cx+TX*Math.cos(ang)).toFixed(1)}" y="${(cy+TX*Math.sin(ang)+11).toFixed(1)}" class="hm-n" text-anchor="middle">${v}</text>`)}
  p.push(`<circle cx="${cx}" cy="${cy}" r="${RB}" fill="${col(25,1)}" data-tip="${escapeHtml(tip(25,1))}"/>`,`<circle cx="${cx}" cy="${cy}" r="${RI}" fill="${col(25,2)}" data-tip="${escapeHtml(tip(25,2))}"/>`);
  return `<svg class="hm-board${dimSingles?' dbl':''}" viewBox="0 0 700 700" onclick="heatTip(event)" role="img" aria-label="Heatmap">${p.join('')}</svg>`;
}
function heatTip(e){const t=e&&e.target&&e.target.getAttribute&&e.target.getAttribute('data-tip');const el=document.getElementById('hmTip');if(el&&t)el.textContent=t}

/* Face-à-face : bilan contre chaque adversaire sur la période. */
function h2hCard(c,name,games){
  const opp={};
  games.forEach(g=>{g.h.players.forEach(p=>{if(p.name===name)return;const o=opp[p.name]=opp[p.name]||{n:0,w:0,l:0,bot:p.isBot};o.n++;if(g.won)o.w++;else if(g.h.winner===p.name)o.l++})});
  const list=Object.keys(opp).map(k=>Object.assign({name:k},opp[k])).sort((a,b)=>b.n-a.n).slice(0,8);
  if(!list.length)return'';
  return `<div class="card sd-card"><div class="chart-title">⚔️ Face-à-face</div>${list.map(o=>{const pw=o.n?100*o.w/o.n:0,pl=o.n?100*o.l/o.n:0;
    return `<div class="h2h"><div class="h2h-top"><span class="h2h-me">${o.w}</span><span class="h2h-name">${o.bot?'🤖 ':''}${escapeHtml(o.name)}<small>${o.n} partie${o.n>1?'s':''}</small></span><span class="h2h-op">${o.l}</span></div><div class="h2h-bar"><i class="w" style="width:${pw}%"></i><i class="l" style="width:${pl}%"></i></div></div>`}).join('')}<div class="sd-note">Victoires de ${escapeHtml(name)} à gauche, de l'adversaire à droite.</div></div>`;
}

/* Historique : une carte par partie, détail au toucher. */
function renderHistory(c){
  const hist=document.getElementById('statsHistory');if(!hist)return;
  if(!c.history.length){hist.innerHTML='<div class="empty-note">Pas encore d\'historique.</div>';return}
  hist.innerHTML=c.history.slice(0,100).map((h,i)=>{
    const d=new Date(h.date);const when=d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const x01=typeof h.mode==='number';const fmt=(h.setsBestOf||1)>1?' · BO'+h.setsBestOf+' sets':(h.legsBestOf||1)>1?' · BO'+h.legsBestOf:'';
    const dur=h.durationSec?' · '+Math.round(h.durationSec/60)+' min':'';
    const rows=h.players.map(p=>{const st=p.st||{};const avg=st.dt?fmtN(Math.round(30*st.sc/st.dt)/10):st.rd?fmtN(Math.round(10*st.mk/st.rd)/10)+' MPR':'';
      const leg=(h.legsBestOf||1)>1||(h.setsBestOf||1)>1?`<span class="hp-legs">${(h.setsBestOf||1)>1?p.sets:p.legs}</span>`:'';
      return `<div class="hp${p.name===h.winner?' win':''}">${leg}<span class="hp-n">${p.name===h.winner?'🏆 ':''}${p.isBot?'🤖 ':''}${escapeHtml(p.name)}</span><span class="hp-a">${avg}</span></div>`}).join('');
    let det='';
    if(STATS_UI.open===i){
      det='<table class="stats-table hd-table"><thead><tr><th></th>'+(x01?'<th>Moy</th><th>F9</th><th>DBL</th><th>180</th><th>Meil.</th><th>CO</th>':'<th>Meil.</th><th>MPR</th><th>Score</th>')+'</tr></thead><tbody>'+h.players.map(p=>{const st=p.st||{};
        return '<tr><td>'+escapeHtml(p.name)+'</td>'+(x01?`<td>${st.dt?fmtN(Math.round(30*st.sc/st.dt)/10):'—'}</td><td>${st.f9!=null?fmtN(Math.round(10*st.f9/3)/10):'—'}</td><td>${st.da?Math.round(100*st.dh/st.da)+'%':'—'}</td><td>${st.c180!=null?st.c180:'—'}</td><td>${st.best||'—'}</td><td>${st.hiCo||'—'}</td>`:`<td>${st.best||'—'}</td><td>${st.rd?fmtN(Math.round(10*st.mk/st.rd)/10):'—'}</td><td>${p.score}</td>`)+'</tr>'}).join('')+'</tbody></table>';
      if(!h.players.some(p=>p.st))det='<div class="sd-note">Partie jouée avant la v1.7 : pas de détail enregistré.</div>';
    }
    return `<div class="hcard${STATS_UI.open===i?' open':''}" onclick="statsHistOpen(${i})"><div class="hc-head"><span class="hc-mode">${fmtMode(h.mode)}${h.finishDouble&&x01?' · DO':''}${fmt}</span><span class="hc-date">${when}${dur}</span></div><div class="hc-players">${rows}</div>${det}</div>`;
  }).join('');
}
function statsHistOpen(i){STATS_UI.open=STATS_UI.open===i?-1:i;renderHistory(loadCareer())}
/* ================== Sauvegarde / restauration ================== */
function careerBackupText(){return JSON.stringify({app:'perfect-darts',kind:'career',v:1,date:new Date().toISOString(),career:loadCareer()})}
function careerSummary(c){const n=Object.keys(c.profiles||{}).length,g=(c.history||[]).length;return `${n} joueur${n>1?'s':''} · ${g} partie${g>1?'s':''} dans l'historique`}
function bkInfo(t,ok){const el=document.getElementById('bkInfo');if(el){el.textContent=t;el.className='bk-info'+(ok===false?' err':ok?' ok':'')}}
function exportCareer(){
  const txt=careerBackupText(),ta=document.getElementById('bkText');
  const done=()=>{showToast('Sauvegarde copiée','success');bkInfo('✅ Copiée ('+careerSummary(loadCareer())+'). Colle-la dans un message ou un mail à toi-même.',true)};
  const manual=()=>{if(ta){ta.value=txt;try{ta.focus();ta.select()}catch(e){}}bkInfo('Sélectionne le texte ci-dessus et copie-le (appui long → Copier).')};
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,manual);return}}catch(e){}
  manual();
}
function downloadCareer(){
  try{const b=new Blob([careerBackupText()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='perfect-darts-stats-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);bkInfo('💾 Fichier créé. Si rien ne se télécharge sur ton téléphone, utilise « Copier ma sauvegarde ».')}
  catch(e){exportCareer()}
}
function parseCareerBackup(txt){
  let o;try{o=JSON.parse(String(txt||'').trim())}catch(e){return null}
  const c=o&&o.app==='perfect-darts'&&o.career?o.career:(o&&o.profiles?o:null);
  if(!c||typeof c.profiles!=='object')return null;
  c.history=Array.isArray(c.history)?c.history:[];return c;
}
function applyCareerBackup(txt){
  const c=parseCareerBackup(txt);
  if(!c){bkInfo('❌ Ce texte n’est pas une sauvegarde Perfect Darts.',false);return}
  askConfirm('Remplacer les stats de cet appareil par la sauvegarde ('+careerSummary(c)+') ?','Restaurer','Annuler',ok=>{
    if(!ok)return;saveCareer(c);if(typeof coachVersion!=='undefined')coachVersion++;
    bkInfo('✅ Restaurée : '+careerSummary(c),true);showToast('Stats restaurées','success');
    const ta=document.getElementById('bkText');if(ta)ta.value='';
  });
}
function importCareerText(){const ta=document.getElementById('bkText');applyCareerBackup(ta&&ta.value)}
function importCareerFile(input){
  const f=input&&input.files&&input.files[0];if(!f)return;
  const r=new FileReader();r.onload=()=>{applyCareerBackup(r.result);input.value=''};r.onerror=()=>bkInfo('❌ Lecture du fichier impossible.',false);r.readAsText(f);
}
function resetCareer(){if(confirm('Effacer toutes les statistiques et l\'historique ?')){try{localStorage.removeItem(CAREER_KEY)}catch(e){}renderStatsScreen();showToast('Stats effacées','success')}}
