'use strict';
function renderAll(){renderHUD();renderDarts();renderStats();renderCheckout();renderLog();renderModeLabel();renderCricketBoard();if(window.NET&&NET.onRender)NET.onRender()}
/* Cricket : scoreboard type ardoise des apps concurrentes. Une colonne par
   joueur (nom + score), une ligne par cible (20→15, Bull). Barres de touches
   I/II/III, croix pleine = cible fermée. Le joueur actif voit ses marques de
   la volée en cours affichées en direct. */
function renderCricketBoard(){
  renderFocus();
  const el=document.getElementById('cricketBoard');
  if(!el)return;
  const on=STATE.mode==='cricket'&&!!STATE.players.length;setSwipeMode(on);renderCricketExtras(on);
  if(!on){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');
  const targets=[20,19,18,17,16,15,25];
  const cur=STATE.currentPlayer;
  const marksOf=(i,t)=>{
    let m=(STATE.cricketMarks[i]||{})[t]||0;
    if(i===cur&&!STATE.gameOver)STATE.dartsThisTurn.forEach(d=>{if(d.baseValue===t)m=Math.min(3,m+(d.mult||1))});
    return m;
  };
  const allClosed=t=>STATE.players.every((p,i)=>((STATE.cricketMarks[i]||{})[t]||0)>=3);
  const markCell=(i,t)=>{
    const m=marksOf(i,t);
    let s='',cls='cb-m';
    if(m>=3){s='✕';cls+=' closed'}
    else if(m===2){s='//';cls+=' m2'}
    else if(m===1){s='/';cls+=' m1'}
    if(i===cur)cls+=' active';
    return `<span class="${cls}">${s}</span>`;
  };
  const cols=`grid-template-columns:52px repeat(${STATE.players.length},minmax(0,1fr))`;
  el.innerHTML=`<div class="cb-grid">`
    +`<div class="cb-row cb-head" style="${cols}"><span class="cb-t"></span>${STATE.players.map((p,i)=>`<span class="cb-p${i===cur?' active':''}">${escapeHtml(p.name)}</span>`).join('')}</div>`
    +targets.map(t=>`<div class="cb-row" style="${cols}"><span class="cb-t${allClosed(t)?' cb-done':' '+crkInfo().state(t)}">${t===25?'Bull':t}</span>${STATE.players.map((p,i)=>markCell(i,t)).join('')}</div>`).join('')
    +`<div class="cb-row cb-score" style="${cols}"><span class="cb-t">Pts</span>${STATE.players.map((p,i)=>`<span class="cb-s${i===cur?' active':''}">${p.score}</span>`).join('')}</div>`
    +`</div>`;
}

/* ===== Focus : la bonne cible mise en évidence, dans tous les modes =====
   modeFocus() décrit, pour le joueur actif et la volée en cours :
   - aim  : segments à viser [{b:base, m:mult}] (m=0 : n'importe quel multiple)
   - live : numéros utiles (les autres sont atténués) ou null (tous utiles)
   - big/sub : bandeau d'objectif lisible de loin (modes d'entraînement)
   Le Cricket a ses propres aides (renderCricketExtras). */
function tokAim(t){if(!t)return null;if(t==='DBull')return{b:25,m:2};if(t==='Bull')return{b:25,m:1};if(t[0]==='T')return{b:+t.slice(1),m:3};if(t[0]==='D')return{b:+t.slice(1),m:2};if(t[0]==='S')return{b:+t.slice(1),m:1};return{b:+t,m:1}}
function modeFocus(){
  const p=STATE.players[STATE.currentPlayer];
  if(!p||STATE.gameOver||STATE.mode==='cricket')return null;
  const d=STATE.dartsThisTurn||[],nd=d.length,lbl=b=>b===25?'Bull':b,dn=b=>b===25?'D-Bull':'D'+b;
  if(typeof STATE.mode==='number'||STATE.mode==='co121'){
    const a=tokAim(String(coRouteShown||'').trim().split(/\s+/)[0]);
    return a&&a.b?{aim:[a],live:null}:null;
  }
  if(STATE.mode==='around'){
    const t=aroundTargetAfter(STATE.currentPlayer,d),need=STATE.aroundVariant||1;if(t>21)return null;
    const b=t>20?25:t,m=b===25?(need>1?2:0):(need>1?need:0);
    return{aim:[{b,m}],live:[b],big:(m===2?'D':m===3?'T':'')+lbl(b),sub:`Around the Clock · cible ${Math.min(t,21)}/21${nd<3?' · '+(3-nd)+' fléchette'+(3-nd>1?'s':''):''}`};
  }
  if(STATE.mode==='bobs27'){
    const r=STATE.bobsRound,b=r>=BOBS_ROUNDS?25:r,w=b===25?50:2*b,hits=d.filter(x=>x.mult===2&&x.baseValue===b).length;
    return{aim:[{b,m:2}],live:[b],big:dn(b),sub:`Bob's 27 · tour ${Math.min(r,BOBS_ROUNDS)}/${BOBS_ROUNDS} · ${hits?'+'+hits*w+' cette volée':'touché +'+w+' · raté −'+w}`};
  }
  if(STATE.mode==='doubles'&&STATE.ms&&STATE.ms.targets){
    const ms=STATE.ms,b=ms.targets[ms.idx],nx=ms.targets[ms.idx+1];
    return{aim:[{b,m:2}],live:[b],big:dn(b),sub:`Volée ${ms.idx+1}/${DOUBLES_ROUNDS} · ${ms.hits} touché${ms.hits>1?'s':''}${nx?' · ensuite '+dn(nx):''}`};
  }
  if(STATE.mode==='shanghai'){
    const r=Math.min(p.turns+1,SHANGHAI_ROUNDS),got=new Set(d.filter(x=>x.baseValue===r).map(x=>x.mult));
    const miss=[3,2,1].filter(m=>!got.has(m));
    const chip=(m,n)=>(got.has(m)?'✓ ':'')+n;
    return{aim:miss.map(m=>({b:r,m})),live:[r],big:String(r),sub:`Shanghai · manche ${r}/${SHANGHAI_ROUNDS} · ${chip(1,'Simple')} · ${chip(2,'Double')} · ${chip(3,'Triple')}`};
  }
  if(STATE.mode==='killer'){
    if(!p.isKiller)return{aim:[{b:p.kNum,m:2}],live:[p.kNum],big:dn(p.kNum),sub:'Touche TON double pour devenir KILLER 🔪'};
    const opp=STATE.players.filter(o=>o!==p&&o.lives>0);
    return{aim:opp.map(o=>({b:o.kNum,m:2})),live:opp.map(o=>o.kNum),big:opp.map(o=>dn(o.kNum)).join(' · '),sub:'KILLER 🔪 · '+opp.map(o=>`${o.name} ${'♥'.repeat(o.lives)}`).join(' · ')};
  }
  if(STATE.mode==='catch40'){
    const tot=d.reduce((s,x)=>s+x.value,0),need=CATCH40_MIN-tot;
    return{aim:[],live:null,big:need>0?'Encore '+need:'✓ '+tot,sub:`Catch 40 · volée ${p.turns+1}/${CATCH40_TURNS} · ${'♥'.repeat(Math.max(0,STATE.lives))} · minimum ${CATCH40_MIN} par volée`};
  }
  if(STATE.mode==='highscore'){
    const tot=d.reduce((s,x)=>s+x.value,0),avg=p.turns?Math.round(p.score/p.turns):0;
    return{aim:[],live:null,big:String(p.score+tot),sub:`Highscore · volée ${p.turns+1}/${HIGHSCORE_TURNS} · moyenne ${avg}${tot?' · volée '+tot:''}`};
  }
  return null;
}
/* Cible ajustée à la hauteur restante (portrait) : toujours visible en entier. */
function tvLandscape(){return typeof matchMedia==='function'&&matchMedia(TV_LANDSCAPE_MQ).matches}
const TV_LANDSCAPE_MQ='(orientation:landscape) and (max-height:599px) and (min-width:560px)';
function fitBoard(){
  const svg=document.getElementById('dartboard'),bc=document.getElementById('boardContainer');
  if(!svg||!bc||!svg.getBoundingClientRect||typeof innerHeight!=='number'||!svg.style)return;
  if(bc.classList.contains('hidden')||currentScreen!=='screenGame'){svg.style.maxWidth='';return}
  /* Téléphone en paysage (mise en page TV / recopie d'écran) : la cible occupe la
     colonne de droite sur toute la hauteur. */
  if(tvLandscape()){const gr=document.querySelector('#screenGame .game-right');const top=svg.getBoundingClientRect().top+(gr?gr.scrollTop:0);svg.style.maxWidth=Math.max(170,Math.floor(innerHeight-top-8))+'px';return}
  /* Limite basse : la barre Voix/Undo si elle est fixée en bas (paysage, tablette), sinon le bas de l'écran. */
  let limit=innerHeight;const ctl=document.querySelector('#screenGame .controls');
  if(ctl){const r=ctl.getBoundingClientRect();if(r.height&&r.top>0&&r.bottom<=innerHeight+1)limit=r.top}
  const body=document.querySelector('#screenGame .game-body');
  const top=svg.getBoundingClientRect().top+(window.scrollY||0)+(body&&body.scrollHeight>body.clientHeight?body.scrollTop:0);
  svg.style.maxWidth=Math.max(240,Math.floor(limit-top-10))+'px';
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',()=>{try{fitBoard()}catch(e){}});
function renderFocus(){
  const f=modeFocus(),aim=f?f.aim:[],live=f&&f.live?new Set(f.live):null;
  const hit=(b,m)=>aim.some(a=>a.b===b&&(!a.m||a.m===m||(m===1&&a.m===1)));
  const bar=document.getElementById('focusBar');
  {const sg=document.getElementById('screenGame');if(sg&&sg.classList)sg.classList.toggle('has-focus',!!(f&&f.big))}if(bar){if(f&&f.big){bar.innerHTML=`<div class="fb-big">${f.big}</div><div class="fb-sub">${f.sub||''}</div>`;bar.classList.add('active')}else{bar.classList.remove('active');bar.innerHTML=''}}
  const crk=STATE.mode==='cricket';
  const svg=document.getElementById('dartboard');
  if(svg&&svg.querySelectorAll)svg.querySelectorAll('[data-base]').forEach(e=>{
    const b=+e.getAttribute('data-base'),m=+e.getAttribute('data-mult');
    e.classList.toggle('fx-off',!crk&&!!live&&b>0&&!live.has(b));
    e.classList.toggle('fx-aim',!crk&&b>0&&hit(b,m));
  });
  const grid=document.getElementById('boardGrid');
  if(grid&&grid.querySelectorAll&&!crk)grid.querySelectorAll('.num-btn[data-n]').forEach(btn=>{
    const b=+btn.dataset.n;
    btn.classList.toggle('fx-aim',aim.some(a=>a.b===b));
    btn.classList.toggle('fx-off',!!live&&!live.has(b));
  });
  fitBoard();
  const ms=new Set(aim.map(a=>a.m));
  if(document.querySelectorAll)document.querySelectorAll('.mult-btn').forEach(btn=>btn.classList.toggle('fx-hint',!crk&&ms.size===1&&aim.length>0&&ms.has(+btn.dataset.m)&&!ms.has(0)));
}

/* ===== Cricket : aides de lecture (mini-grille, pavé, cible, stats) =====
   Tout est calculé pour le joueur actif, volée en cours comprise :
   - pts   : il a fermé, au moins un adversaire non -> il marque des points
   - danger: un adversaire a fermé, lui non -> l'adversaire peut marquer
   - dead  : fermée par tous -> plus d'intérêt */
const CRK_T=[20,19,18,17,16,15,25];
function crkInfo(){
  const cur=STATE.currentPlayer,n=STATE.players.length,live=!STATE.gameOver;
  const marks=(i,t)=>{let m=(STATE.cricketMarks[i]||{})[t]||0;if(i===cur&&live)STATE.dartsThisTurn.forEach(d=>{if(d.baseValue===t)m+=d.mult||1});return m};
  const closed=(i,t)=>marks(i,t)>=3;
  const state=t=>{
    const me=closed(cur,t),others=STATE.players.map((p,i)=>i).filter(i=>i!==cur);
    if(me&&others.every(i=>closed(i,t)))return'dead';
    if(!n||others.length===0)return me?'dead':'';
    if(me&&others.some(i=>!closed(i,t)))return'pts';
    if(!me&&others.some(i=>closed(i,t)))return'danger';
    return'';
  };
  /* Points de la volée en cours, en direct (le score officiel est appliqué en fin de volée). */
  let livePts=0;if(live){const mk={};CRK_T.forEach(t=>mk[t]=(STATE.cricketMarks[cur]||{})[t]||0);STATE.dartsThisTurn.forEach(d=>{const t=d.baseValue;if(!CRK_T.includes(t))return;const after=mk[t]+(d.mult||1),extra=Math.max(0,after-Math.max(3,mk[t]));mk[t]=after;if(extra&&STATE.players.some((p,i)=>i!==cur&&((STATE.cricketMarks[i]||{})[t]||0)<3))livePts+=extra*t})}
  const visitMarks=live?STATE.dartsThisTurn.reduce((s,d)=>s+(CRK_T.includes(d.baseValue)?(d.mult||1):0),0):0;
  return{marks,closed,state,visitMarks,livePts,closedOf:i=>CRK_T.filter(t=>closed(i,t)).length};
}
function crkMpr(p){const t=p.turns+(STATE.players[STATE.currentPlayer]===p&&STATE.dartsThisTurn.length?1:0);const m=(p.crkMarks||0)+(STATE.players[STATE.currentPlayer]===p?crkInfo().visitMarks:0);return t?(Math.round(10*m/t)/10).toFixed(1):'0.0'}
function statLabels(a,b,c){const l=document.querySelectorAll?document.querySelectorAll('.stats-bar .st-lbl'):[];[a,b,c].forEach((x,k)=>{if(l[k]&&l[k].textContent!==x)l[k].textContent=x})}
const crkSym=m=>m>=3?'<i class="cm-ring">✕</i>':m===2?'✕':m===1?'/':'';
function renderCricketExtras(on){
  const mini=document.getElementById('crkMini');
  if(!on){if(mini)mini.innerHTML='';return}
  const c=crkInfo(),cur=STATE.currentPlayer;
  if(mini){
    const head='<div class="cm-row cm-head"><span class="cm-n"></span>'+CRK_T.map(t=>`<span class="cm-t ${c.state(t)}">${t===25?'B':t}</span>`).join('')+'<span class="cm-s">Pts</span></div>';
    const rows=STATE.players.map((p,i)=>`<div class="cm-row${i===cur&&!STATE.gameOver?' on':''}"><span class="cm-n">${escapeHtml(p.name)}</span>`
      +CRK_T.map(t=>{const m=Math.min(3,c.marks(i,t));return`<span class="cm-m m${m} ${c.state(t)}">${crkSym(m)}</span>`}).join('')
      +`<span class="cm-s">${i===cur&&c.livePts&&!STATE.cutThroat?p.score+'<small>+'+c.livePts+'</small>':p.score}</span></div>`).join('');
    const foot=`<div class="cm-foot">${STATE.players.map((p,i)=>`<span${i===cur?' class="on"':''}>${escapeHtml(p.name)} <b>MPR ${crkMpr(p)}</b> · ${c.closedOf(i)}/7</span>`).join('')}</div>`;
    mini.innerHTML=head+rows+foot;
  }
  /* Pavé : marques du joueur actif + état de la cible sur chaque bouton. */
  const grid=document.getElementById('boardGrid');
  if(grid&&grid.querySelectorAll)grid.querySelectorAll('.num-btn[data-crk]').forEach(b=>{
    const t=+b.dataset.crk,m=Math.min(3,c.marks(cur,t)),st=c.state(t);
    b.className='num-btn crk-btn'+(t===25?' bull':'')+(st?' '+st:'');
    const mk=b.querySelector('.cb-mk');
    if(mk)mk.textContent=st==='dead'?'fermée':st==='pts'?'+ points':m?crkSym(m)+'  reste '+(3-m):'reste 3';
  });
  /* Cible : secteurs hors jeu et cibles mortes atténués. */
  const svg=document.getElementById('dartboard');
  if(svg&&svg.querySelectorAll)svg.querySelectorAll('[data-base]').forEach(e=>{
    const v=+e.getAttribute('data-base');if(!v){return}
    const st=CRK_T.includes(v)?c.state(v):'off';
    e.classList.toggle('crk-off',st==='off'||st==='dead');
    e.classList.toggle('crk-pts',st==='pts');
  });
}

/* Cricket : saisie (pavé/cible) et grille de score sur deux pages côte à côte,
   on passe de l'une à l'autre par swipe latéral ou par les onglets. */
let swipeOn=false;
function setSwipeMode(on){
  const scr=document.getElementById('screenGame');if(!scr||swipeOn===on)return;
  swipeOn=on;scr.classList.toggle('crk-swipe',on);
  const sw=document.getElementById('gameSwipe');if(sw&&!sw.dataset.bound&&sw.addEventListener){sw.dataset.bound='1';sw.addEventListener('scroll',swipeSync,{passive:true})}
  swipeTo(0,true);placeCricketBoard();
}
/* Grand écran : la grille Cricket va dans la colonne de gauche (lisible de loin),
   la colonne de droite garde toute la place pour la saisie. */
function wideLayout(){try{return !!(window.matchMedia&&(matchMedia('(min-width:700px) and (min-height:600px)').matches||matchMedia(TV_LANDSCAPE_MQ).matches))}catch(e){return false}}
function placeCricketBoard(){
  const el=document.getElementById('cricketBoard'),pg=document.getElementById('pageGrid'),left=document.querySelector?document.querySelector('#screenGame .game-left'):null;
  if(!el||!pg||!left||!left.insertBefore)return;
  const wide=swipeOn&&wideLayout(),host=wide?left:pg;
  if(el.parentNode===host)return;
  if(wide)left.insertBefore(el,left.querySelector('.stats-bar'));else pg.appendChild(el);
}
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',()=>{try{placeCricketBoard()}catch(e){}});
function swipePage(){const sw=document.getElementById('gameSwipe');return sw&&sw.clientWidth?Math.round(sw.scrollLeft/sw.clientWidth):0}
function swipeTo(p,instant){
  const sw=document.getElementById('gameSwipe');if(!sw)return;
  const left=p*(sw.clientWidth||0);
  try{sw.scrollTo({left,behavior:instant?'auto':'smooth'})}catch(e){sw.scrollLeft=left}
  swipeTabs(p);
}
function swipeSync(){swipeTabs(swipePage())}
function swipeTabs(p){
  const t=document.getElementById('swipeTabs');if(!t||!t.querySelectorAll)return;
  t.querySelectorAll('.sw-tab').forEach(b=>b.classList.toggle('on',+b.dataset.p===p));
}
function renderHUD(){const container=document.getElementById('hudScores');container.innerHTML='';const leaderIdx=getLeaderIndex();STATE.players.forEach((p,i)=>{const card=document.createElement('div');card.className='hud-player'+(i===STATE.currentPlayer&&!STATE.gameOver?' active':'');let scoreDisplay=p.score,scoreClass='';if(typeof STATE.mode==='number'){/* restant en direct pendant la volée du joueur actif (si pas de bust) */let sc=p.score;if(i===STATE.currentPlayer&&!STATE.gameOver&&!STATE.botShowing&&STATE.dartsThisTurn.length&&(!STATE.doubleIn||p.started)){const r=p.score-STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);if(r>=0&&!(STATE.finishDouble&&r===1)){sc=r;scoreClass='live'}}scoreDisplay=sc;if(sc<=170&&sc>1&&CHECKOUTS[sc])scoreClass+=' checkout';else if(sc<=40)scoreClass+=' low'}if(STATE.mode==='cricket')scoreDisplay=p.score;if(STATE.mode==='around'&&STATE.aroundClock[i]){scoreDisplay=STATE.aroundClock[i]>20?'BULL':STATE.aroundClock[i]}if(STATE.mode==='bobs27'){scoreDisplay=`${p.score} · D${STATE.bobsRound>=BOBS_ROUNDS?'BULL':STATE.bobsRound}`}if(STATE.mode==='catch40'){scoreDisplay=`${p.score} · ${'♥'.repeat(Math.max(0,STATE.lives))||'—'}`}{const md=modeScoreDisplay(p,i);if(md!=null)scoreDisplay=md}const crown=(i===leaderIdx&&STATE.players.length>1)?'<span class="crown">👑</span>':'';const legs=(typeof isMatchFormat==='function'&&isMatchFormat())?`<div class="h-legs">${(STATE.setsBestOf||1)>1?'S '+(p.sets||0)+' · ':''}L ${p.legs||0}</div>`:'';card.innerHTML=`${crown}<div class="h-name">${escapeHtml(p.name)}</div><div class="h-score ${scoreClass}">${scoreDisplay}</div>${legs}`;container.appendChild(card)});const activeCards=container.querySelectorAll('.hud-player.active');if(activeCards.length){const a=activeCards[0];const target=a.offsetLeft-(container.clientWidth-a.offsetWidth)/2;try{container.scrollTo({left:Math.max(0,target),behavior:'smooth'})}catch(e){container.scrollLeft=Math.max(0,target)}}const turnEl=document.getElementById('hudTurn');turnEl.textContent=hudTurnLabel()}
function renderModeLabel(){const el=document.getElementById('hudMode');if(!el)return;if(typeof STATE.mode==='number')el.textContent=(typeof isMatchFormat==='function'&&isMatchFormat())?`${STATE.mode} ${STATE.finishDouble?'DO':'SO'} · ${(STATE.setsBestOf||1)>1?'BO'+STATE.setsBestOf+' SETS':'BO'+STATE.legsBestOf} · LEG ${STATE.legNumber||1}`:`${STATE.mode} · ${STATE.finishDouble?'DOUBLE OUT':'STRAIGHT OUT'}`;else el.textContent=fmtMode(STATE.mode).toUpperCase()}
function renderDarts(){for(let i=0;i<3;i++){const slot=document.getElementById(`slot${i}`);if(!slot)continue;const dart=STATE.dartsThisTurn[i];slot.className='dart-slot';if(dart){slot.classList.add('filled');if(dart.mult===2)slot.classList.add('double');if(dart.mult===3)slot.classList.add('triple');slot.innerHTML=`<div class="dart-value">${dart.value}</div><div class="dart-label">${dart.label}</div>`}else{slot.innerHTML='—'}}}
function renderStats(){const p=STATE.players[STATE.currentPlayer];if(!p)return;if(STATE.mode==='cricket'){const c=crkInfo(),i=STATE.currentPlayer;statLabels('MPR','Marques volée','Fermées');document.getElementById('statAvg').textContent=crkMpr(p);document.getElementById('statTurns').textContent=c.visitMarks;document.getElementById('statBest').textContent=c.closedOf(i)+'/7';return}statLabels('Moy.','Volées','Meilleur');document.getElementById('statAvg').textContent=p.dartsThrown?Math.round(3*p.totalScored/p.dartsThrown):0;document.getElementById('statTurns').textContent=p.turns;document.getElementById('statBest').textContent=p.bestTurn||0}
let coRouteShown='';
function renderCheckout(){coRouteShown='';const box=document.getElementById('checkoutBox');const routeEl=document.getElementById('checkoutRoute');if(!box)return;if((typeof STATE.mode!=='number'&&STATE.mode!=='co121')||STATE.gameOver){box.classList.remove('active');return}const p=STATE.players[STATE.currentPlayer];if(!p)return;const currentTotal=STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);const remaining=p.score-currentTotal;const dartsLeft=3-visitDarts();let route=checkoutRoute(remaining,dartsLeft,STATE.mode==='co121'?true:STATE.finishDouble);
/* Coach : route calculée sur les doubles réels du joueur (double out, joueur humain). */
let coachTxt='';if(route&&SETTINGS.coach!==false&&!p.isBot&&(STATE.finishDouble||STATE.mode==='co121')){const c=coachRoute(remaining,dartsLeft,p.name);if(c){route=c.route;coachTxt=c.standard?`🎯 Coach · D${c.seg===25?'Bull':c.seg} : ${c.pct} % pour toi`:`🎯 Coach · ta route (D${c.seg===25?'Bull':c.seg} : ${c.pct} %)`}}
const lbl=box.querySelector?box.querySelector('.co-label'):null;if(lbl)lbl.textContent=coachTxt||'💡 Checkout suggéré';
coRouteShown=route||'';if(route){const wasActive=box.classList.contains('active');routeEl.textContent=route;box.classList.add('active');if(!wasActive&&remaining<=40&&!(window.NET&&NET.mode==='client'))playEvent('checkout')}else{box.classList.remove('active')}}
function renderLog(){const panel=document.getElementById('logPanel');if(!panel)return;panel.innerHTML=STATE.log.slice(0,12).map(e=>`<div class="log-entry ${e.cls||''}">${escapeHtml(e.msg)}</div>`).join('')}
function toggleLog(){const panel=document.getElementById('logPanel');if(!panel)return;const hidden=panel.classList.toggle('hidden');const btn=document.getElementById('logToggleBtn');if(btn)btn.textContent=hidden?'📜 Historique':'📜 Masquer l\'historique'}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
let currentScreen='screenSetup';
function showScreen(id){currentScreen=id;if(typeof keepAwake==='function')keepAwake(id==='screenGame');if(id==="screenGame"&&typeof setTimeout==="function")setTimeout(()=>{try{fitBoard()}catch(e){}},0);document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');window.scrollTo(0,0)}
function flashPlayerBust(idx){const cards=document.querySelectorAll('.hud-player');if(cards[idx]){cards[idx].classList.add('bust-flash');setTimeout(()=>cards[idx].classList.remove('bust-flash'),700)}}
let toastTimer=null;function showToast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show '+type;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function updateMuteBtn(){const b=document.getElementById('muteBtn');if(b)b.textContent=SETTINGS.voiceLang==='off'?'🔇 Voix':'🔊 Voix'}
function toggleMute(){if(SETTINGS.voiceLang==='off'){SETTINGS.voiceLang=SETTINGS.prevVoice||'fr'}else{SETTINGS.prevVoice=SETTINGS.voiceLang;SETTINGS.voiceLang='off'}voiceLang=SETTINGS.voiceLang;saveSettings();try{stopVoice();if(lastAudio){lastAudio.pause();lastAudio=null}}catch(e){}updateMuteBtn();showToast(SETTINGS.voiceLang==='off'?'Voix désactivée':'Voix activée','success')}
function applyModeFieldVisibility(){const mode=document.getElementById('cfgMode').value;const x01=!['cricket','around','bobs27','catch40','highscore'].concat(EXTRA_MODES).includes(mode);const practice=PRACTICE_MODES.includes(mode);const fFinish=document.getElementById('fieldFinish');if(fFinish)fFinish.style.display=x01?'':'none';const solo=PLAYER_COUNT===1&&!practice;const fOp=document.getElementById('fieldOpponent');if(fOp)fOp.style.display=solo?'':'none';const opv=(document.getElementById('cfgOpponent')||{value:'bot'}).value;const fBot=document.getElementById('fieldBot');if(fBot)fBot.style.display=(solo&&opv==='bot')?'':'none';const fDI=document.getElementById('fieldDoubleIn');if(fDI)fDI.style.display=x01?'':'none';const fLg=document.getElementById('fieldLegs');if(fLg)fLg.style.display=x01?'':'none';const fHc=document.getElementById('fieldHandicap');if(fHc)fHc.style.display=x01?'':'none';const fCT=document.getElementById('fieldCutThroat');if(fCT)fCT.style.display=mode==='cricket'?'':'none';const fAV=document.getElementById('fieldAround');if(fAV)fAV.style.display=mode==='around'?'':'none';const cp=document.getElementById('cardPlayers');if(cp)cp.style.display=practice?'none':'';updateRulesBox()}
/* ===== Règles du mode sélectionné : boîte mise à jour en direct ===== */
function rulesForMode(){
  const raw=document.getElementById('cfgMode').value;
  const mode=isNaN(parseInt(raw,10))?raw:parseInt(raw,10);
  const opt=id=>document.getElementById(id);
  if(typeof mode==='number'){
    const finishDouble=opt('cfgFinish').value==='double';
    const di=!!(opt('cfgDoubleIn')||{}).checked;
    const p=[`Chaque joueur part à ${mode} points et soustrait le total de chaque volée de 3 fléchettes. Le premier à atteindre exactement 0 gagne.`];
    if(di)p.push('Double à l\u2019ouverture : la partie ne commence à compter qu\u2019au premier double touché — tout ce qui précède vaut zéro.');
    if(finishDouble)p.push('Fin en double : le dernier dard doit toucher une double (ou le Bull, 25 pts). Rester à 1 point ou passer sous 0 fait BUST : la volée ne marque rien.');
    else p.push('Fin « simple » : atteindre exactement 0 suffit ; passer sous 0 fait BUST.');
    const lg=parseInt((opt('cfgLegs')||{value:'1'}).value,10)||1,st=parseInt((opt('cfgSets')||{value:'1'}).value,10)||1;
    if(st>1)p.push(`Match au meilleur de ${st} sets ; chaque set au meilleur de ${lg} leg${lg>1?'s':''} (${Math.floor(lg/2)+1} pour gagner un set). Le joueur qui commence alterne à chaque leg et à chaque set.`);
    else if(lg>1)p.push(`Match au meilleur de ${lg} legs : le premier à ${Math.floor(lg/2)+1} legs gagne. Le joueur qui commence alterne à chaque leg.`);
    p.push('Quick-scores (180/140/100/60/26) pour saisir une volée complète après coup ; Undo annule la dernière fléchette.');
    return p;
  }
  if(mode==='cricket'){
    const ct=!!(opt('cfgCutThroat')||{}).checked;
    return [
      'Cibles : 15, 16, 17, 18, 19, 20 et le Bull. Toucher une cible 3 fois la ferme — simple = 1 marque, double = 2, triple = 3, double Bull = 2.',
      'Cible fermée : chaque touche supplémentaire marque des points (valeur de la cible) tant qu\u2019un adversaire ne l\u2019a pas fermée aussi.',
      ct?'Cut-throat : les points marqués vont CHEZ les adversaires qui n\u2019ont pas fermé la cible. Gagne celui qui ferme ses 7 cibles avec le MOINS de points.':'Gagne le joueur qui ferme ses 7 cibles en ayant le PLUS de points.'
    ];
  }
  if(mode==='around'){
    const need=parseInt((opt('cfgAround')||{value:'1'}).value,10)||1;
    const a=need===1?'Un simple sur le numéro en cours suffit à passer au suivant.':need===2?'Il faut toucher le DOUBLE du numéro en cours pour passer au suivant.':'Il faut toucher le TRIPLE du numéro en cours pour passer au suivant.';
    return ['Parcours dans l\u2019ordre : 1, 2, 3 … 20, puis le Bull central.',a,'Gagne le premier qui boucle la série jusqu\u2019au Bull.'];
  }
  {const mr=modeRules(mode);if(mr)return mr}
  if(mode==='bobs27')return [
    'Solo — 20 volées de 3 fléchettes, départ à 27 points. Chaque volée vise un double : D1, D2 … D20 (dernière volée : le double Bull).',
    'Touche du double visé : +2×le numéro (double Bull : +50). Volée entièrement ratée sur ce double : −2×le numéro.',
    'Score ≤ 0 : échec immédiat. Objectif : finir les 20 volées avec le score le plus haut (100 = excellent).'
  ];
  if(mode==='catch40')return [
    'Solo — 10 volées de 3 fléchettes. Chaque volée doit marquer au moins 40 points.',
    'Volée sous 40 : une vie en moins (3 au départ). Plus de vies : échec.',
    'Tenir les 10 volées : réussite — le total marqué fait office de score.'
  ];
  if(mode==='highscore')return [
    'Solo — 10 volées de 3 fléchettes, les points s\u2019additionnent (triple 20 = 60, double Bull = 50).',
    'Total parfait : 600. La volée la plus haute compte dans les records.'
  ];
  return [];
}
function updateRulesBox(){
  const box=document.getElementById('rulesBox'),nameEl=document.getElementById('rulesModeName'),txt=document.getElementById('rulesText');
  if(!box||!txt)return;
  const raw=document.getElementById('cfgMode').value;
  nameEl.textContent=fmtMode(isNaN(parseInt(raw,10))?raw:parseInt(raw,10));
  const parts=rulesForMode();
  txt.innerHTML=parts.map(p=>`<p>${p}</p>`).join('');
  box.classList.toggle('hidden',!parts.length);
}
function openSettings(){loadSettings();[document.getElementById('setTheme'),document.getElementById('setAccent'),document.getElementById('setVoice')].forEach(el=>{if(el)el.value=''});document.getElementById('setTheme').value=SETTINGS.theme==='light'?'light':'dark';document.getElementById('setAccent').value=SETTINGS.accent;const ol=document.getElementById('setOled');if(ol)ol.value=SETTINGS.oled?'1':'';document.getElementById('setVoice').value=SETTINGS.voiceLang;const st=document.getElementById('voiceStatusHost');if(st){const vs=voiceStatus();st.textContent='✅ Voix intégrées à l’app (Vivienne / Remy, Sonia / Ryan) : fonctionnent sans connexion.';}const g=document.getElementById('setGender');if(g)g.value=SETTINGS.voiceGender||'female';const cl=document.getElementById('setCaller');if(cl)cl.value=SETTINGS.caller||'both';const co=document.getElementById('setCoach');if(co)co.value=SETTINGS.coach===false?'':'1';const snd=document.getElementById('setSounds');if(snd)snd.value=SETTINGS.sounds?'1':'';const vol=document.getElementById('setVolume');if(vol)vol.value=String(SETTINGS.volume!=null?SETTINGS.volume:0.5);document.getElementById('setInput').value=SETTINGS.inputMethod;document.getElementById('setVib').value=SETTINGS.vibration?'1':'';showScreen('screenSettings')}
function clearSavedGame(){if(!confirm('Effacer la partie sauvegardée ?'))return;try{localStorage.removeItem(STORAGE_KEY)}catch(e){}updateResumeBtn();showToast('Sauvegarde effacée','success')}
function persistSettings(){SETTINGS.theme=(document.getElementById('setTheme').value==='light')?'light':'dark';SETTINGS.accent=document.getElementById('setAccent').value;const ol=document.getElementById('setOled');if(ol)SETTINGS.oled=ol.value==='1';SETTINGS.voiceLang=document.getElementById('setVoice').value;const g=document.getElementById('setGender');if(g)SETTINGS.voiceGender=g.value;const cl=document.getElementById('setCaller');if(cl)SETTINGS.caller=cl.value||'both';const co=document.getElementById('setCoach');if(co)SETTINGS.coach=co.value==='1';const snd=document.getElementById('setSounds');if(snd)SETTINGS.sounds=snd.value==='1';const vol=document.getElementById('setVolume');if(vol)SETTINGS.volume=parseFloat(vol.value)||0.5;SETTINGS.inputMethod=document.getElementById('setInput').value;SETTINGS.vibration=document.getElementById('setVib').value==='1';saveSettings();applyTheme();voiceLang=SETTINGS.voiceLang;try{pickVoice()}catch(e){}}
function clearSettings(){if(!confirm('Réinitialiser tous les réglages ?'))return;try{localStorage.removeItem(SETTINGS_KEY)}catch(e){}SETTINGS={theme:'dark',accent:'orange',voiceLang:'fr',voiceGender:'female',sounds:true,volume:0.5,inputMethod:'pad',vibration:true,oled:true,botAvg:BOT_DEFAULT};persistSettings();openSettings();showToast('Réglages réinitialisés','success')}

/* ================== Bouton retour Android ==================
   nitron.config.json : webview.backButton="history" -> le retour matériel fait
   history.back() tant que la WebView a de l'historique, sinon quitte l'appli.
   On garde donc une entrée « garde » dans l'historique et on traite popstate :
   panneau ouvert -> fermé ; partie en cours -> confirmation (retour menu,
   partie sauvegardée) ; autre écran -> menu ; menu -> 2e appui pour quitter.
   IMPORTANT (vu sur téléphone) : Chromium/WebView IGNORE les entrées ajoutées
   sans geste de l'utilisateur (« skippable », anti-piège du bouton retour) :
   une garde posée au démarrage est sautée et l'appli se ferme. La garde est
   donc (ré)armée pendant un geste réel (clic/toucher), jamais en différé. */
let backGuardArmed=false;
function backAction(){
  const wo=document.getElementById('winnerOverlay');if(wo&&wo.classList.contains('active'))return'winner';
  const no=document.getElementById('netOverlay');if(no&&no.classList.contains('show'))return'net';
  if(currentScreen==='screenGame')return STATE.gameOver||!STATE.players.length?'menu':'quit';
  if(currentScreen!=='screenSetup')return'menu';
  return'exit';
}
function handleBack(){
  if(typeof closeConfirm==='function'&&closeConfirm(false))return'confirm';
  if(typeof closePicker==='function'&&closePicker())return'picker';
  if(typeof closeCast==='function'&&closeCast())return'cast';
  const a=backAction();
  if(a==='winner')backToSetup();
  else if(a==='net')closeNetPanel();
  else if(a==='quit')confirmQuit();
  else if(a==='menu')showScreen('screenSetup');
  else showToast('Appuyez encore sur Retour pour quitter');
  return a;
}
/* Pose la garde : à appeler uniquement pendant un geste de l'utilisateur. */
function armBackGuard(){if(backGuardArmed||typeof history==='undefined'||typeof history.pushState!=='function')return;try{history.pushState({pd:'guard'},'');backGuardArmed=true}catch(e){}}
function initBackButton(){
  if(typeof history==='undefined'||typeof history.pushState!=='function')return;
  try{history.replaceState({pd:'root'},'')}catch(e){return}
  /* Geste utilisateur (toucher terminé, clic, touche) -> garde réarmée si besoin. */
  ['click','pointerup','touchend','keydown'].forEach(t=>{try{document.addEventListener(t,armBackGuard,true)}catch(e){}});
  window.addEventListener('popstate',()=>{
    /* La garde vient d'être consommée : elle sera remise au prochain geste.
       Au menu, un 2e appui sans toucher l'écran quitte donc l'appli. */
    backGuardArmed=false;
    handleBack();
  });
}

/* ================== Confirmation dans l'app ==================
   Panneau du bas au lieu de confirm() : plus lisible, et la réponse est un vrai
   geste dans la page (réarme la garde du bouton retour). Sans DOM complet
   (tests), repli synchrone sur confirm(). */
let confirmSheet=null,confirmCb=null;
function askConfirm(msg,okLabel,cancelLabel,cb){
  if(typeof HTMLElement==='undefined'||!document.body||typeof document.body.querySelector!=='function'){cb(!!(typeof confirm==='function'&&confirm(msg)));return}
  if(!confirmSheet){
    confirmSheet=document.createElement('div');confirmSheet.className='pick-sheet confirm-sheet';confirmSheet.setAttribute('role','alertdialog');confirmSheet.setAttribute('aria-modal','true');
    confirmSheet.innerHTML='<div class="pick-panel"><div class="pick-grab"></div><div class="confirm-msg"></div><div class="confirm-actions"><button type="button" class="btn btn-primary" data-no></button><button type="button" class="btn btn-ghost" data-ok></button></div></div>';
    confirmSheet.addEventListener('click',e=>{if(e.target===confirmSheet)closeConfirm(false)});
    confirmSheet.querySelector('[data-ok]').onclick=()=>closeConfirm(true);
    confirmSheet.querySelector('[data-no]').onclick=()=>closeConfirm(false);
    document.body.appendChild(confirmSheet);
  }
  confirmSheet.querySelector('.confirm-msg').textContent=msg;
  confirmSheet.querySelector('[data-ok]').textContent=okLabel;
  confirmSheet.querySelector('[data-no]').textContent=cancelLabel;
  confirmCb=cb;
  requestAnimationFrame(()=>{confirmSheet.classList.add('open');try{confirmSheet.querySelector('[data-no]').focus({preventScroll:true})}catch(e){}});
}
function closeConfirm(v){if(!confirmSheet||!confirmSheet.classList.contains('open'))return false;confirmSheet.classList.remove('open');const cb=confirmCb;confirmCb=null;if(cb)cb(!!v);return true}

/* ================== Listes déroulantes : panneau du bas ==================
   Chaque <select> est masqué et remplacé par un bouton au même style ; un appui
   ouvre un panneau listant les options (grandes lignes, coche sur la valeur).
   Le select reste la source de vérité : .value, onchange et 'change' marchent
   comme avant, et une valeur posée par le code met le bouton à jour. */
let pickSheet=null,pickFor=null;
function pickLabelOf(sel){const o=sel.options[sel.selectedIndex];return o?o.textContent:''}
function pickTitleOf(sel){const f=sel.closest('.field');const l=f&&f.querySelector('.label');return (l&&l.textContent)||sel.getAttribute('aria-label')||''}
function closePicker(){if(!pickSheet||!pickSheet.classList.contains('open'))return false;pickSheet.classList.remove('open');const b=pickFor&&pickFor.__pickBtn;pickFor=null;if(b)try{b.focus({preventScroll:true})}catch(e){}return true}
function openPicker(sel){
  if(!pickSheet){pickSheet=document.createElement('div');pickSheet.className='pick-sheet';pickSheet.setAttribute('role','dialog');pickSheet.setAttribute('aria-modal','true');pickSheet.innerHTML='<div class="pick-panel"><div class="pick-grab"></div><div class="pick-title"></div><div class="pick-list" role="listbox"></div></div>';pickSheet.addEventListener('click',e=>{if(e.target===pickSheet)closePicker()});document.body.appendChild(pickSheet)}
  pickFor=sel;
  pickSheet.querySelector('.pick-title').textContent=pickTitleOf(sel);
  const list=pickSheet.querySelector('.pick-list');list.innerHTML='';
  [...sel.options].forEach(o=>{if(o.hidden||o.disabled)return;const b=document.createElement('button');b.type='button';b.className='pick-opt'+(o.value===sel.value?' sel':'');b.setAttribute('role','option');b.setAttribute('aria-selected',o.value===sel.value?'true':'false');b.innerHTML='<span></span><span class="pick-check"></span>';b.firstChild.textContent=o.textContent;b.onclick=()=>{const changed=sel.value!==o.value;sel.value=o.value;closePicker();if(changed)sel.dispatchEvent(new Event('change',{bubbles:true}))};list.appendChild(b)});
  requestAnimationFrame(()=>{pickSheet.classList.add('open');const cur=list.querySelector('.sel');if(cur)cur.scrollIntoView({block:'nearest'})});
}
function enhanceSelect(sel){
  if(sel.__pickBtn||sel.multiple)return;
  const btn=document.createElement('button');btn.type='button';btn.className='pick-btn';
  if(sel.id)btn.setAttribute('aria-label',pickTitleOf(sel)||sel.id);
  const sync=()=>{btn.textContent=pickLabelOf(sel)};
  const d=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(sel,'value',{configurable:true,get(){return d.get.call(this)},set(v){d.set.call(this,v);sync()}});
  const di=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'selectedIndex');
  Object.defineProperty(sel,'selectedIndex',{configurable:true,get(){return di.get.call(this)},set(v){di.set.call(this,v);sync()}});
  sel.addEventListener('change',sync);
  btn.addEventListener('click',()=>openPicker(sel));
  sel.__pickBtn=btn;sel.classList.add('picked');sel.parentNode.insertBefore(btn,sel);sync();
}
function initPickers(){if(typeof HTMLSelectElement==='undefined'||!document.body||!document.body.querySelectorAll)return;document.querySelectorAll('select').forEach(enhanceSelect)}
