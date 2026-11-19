'use strict';
/* ============================================================
   Perfect Darts — moteur de jeu
   Modes : X01 (301/501/701/901/1001, double-in/at-out),
           Cricket (+cut-throat), Around the Clock (1/2/3),
           entraînement solo : Bob's 27, Highscore, Catch 40.
   Bot : moyenne visée 20-120, distribution calibrée, checkout
   probabiliste sur les vraies routes.
   ============================================================ */

/* ================== Noms de joueurs ================== */
function loadSavedNames(){try{return JSON.parse(localStorage.getItem(NAMES_KEY))||[]}catch(e){return[]}}
function savePlayerNames(){try{const a=[];for(let i=1;i<=PLAYER_COUNT;i++){const el=document.getElementById('playerName'+i);a.push(el?el.value.trim():'')}localStorage.setItem(NAMES_KEY,JSON.stringify(a))}catch(e){}}
function changePlayerCount(d){PLAYER_COUNT=Math.max(1,Math.min(6,PLAYER_COUNT+d));SETTINGS.playerCount=PLAYER_COUNT;saveSettings();savePlayerNames();updatePlayerInputs();applyModeFieldVisibility()}
function updatePlayerInputs(){const grid=document.getElementById('playerNamesGrid');grid.innerHTML='';const lbl=document.getElementById('playerCountLabel');if(lbl)lbl.textContent=PLAYER_COUNT+(PLAYER_COUNT>1?' joueurs':' joueur');const hint=document.getElementById('playerCountHint');if(hint)hint.style.display=PLAYER_COUNT===1?'':'none';const favs=profileNames().filter(n=>!n.startsWith('🤖'));const saved=loadSavedNames();for(let i=1;i<=PLAYER_COUNT;i++){const input=document.createElement('input');input.type='text';input.id=`playerName${i}`;input.value=saved[i-1]||favs[i-1]||`Joueur ${i}`;input.maxLength=12;input.setAttribute('list','favPlayers');input.addEventListener('change',savePlayerNames);grid.appendChild(input)}let dl=document.getElementById('favPlayers');if(!favs.length){if(dl)dl.remove();return}if(!dl){dl=document.createElement('datalist');dl.id='favPlayers';document.body.appendChild(dl)}dl.innerHTML=favs.map(f=>`<option value="${escapeHtml(f)}">`).join('')}

/* ================== Création de partie ================== */
function isPracticeMode(){return PRACTICE_MODES.includes(STATE.mode)}
function isX01Mode(){return typeof STATE.mode==='number'}
function practicePlayerName(){const el=document.getElementById('playerName1');return (el&&el.value.trim())||'Entraînement'}
function createPlayer(name,isBot){return{name,isBot,started:false,score:isX01Mode()?STATE.mode:0,turns:0,totalScored:0,dartsThrown:0,bestTurn:0,count180:0,count140:0,count100:0,count60:0,busts:0,doublesAttempted:0,doublesHit:0,checkouts:0,checkoutsAttempted:0,scoreHistory:[isX01Mode()?STATE.mode:0],turnHistory:[]}}
function clampBotAvg(v){return Math.max(BOT_MIN,Math.min(BOT_MAX,parseInt(v,10)||BOT_DEFAULT))}

function startGame(){
  gameSession++;STATE.visitClosing=false;clearTimeout(visitTimer);visitTimer=null;
  let onlineNames=null;
  if(window.NET&&NET.mode==='host'){onlineNames=[(document.getElementById('playerName1')||{value:''}).value.trim()||'Hôte'].concat(NET.roster.map(r=>r.name||`Joueur ${r.seat+1}`))}
  const n=onlineNames?onlineNames.length:PLAYER_COUNT;
  savePlayerNames();
  STATE.mode=isNaN(document.getElementById('cfgMode').value)?document.getElementById('cfgMode').value:parseInt(document.getElementById('cfgMode').value,10);
  STATE.finishDouble=document.getElementById('cfgFinish').value==='double';
  STATE.doubleIn=!!(document.getElementById('cfgDoubleIn')||{}).checked;
  STATE.cutThroat=!!(document.getElementById('cfgCutThroat')||{}).checked;
  STATE.aroundVariant=parseInt((document.getElementById('cfgAround')||{value:'1'}).value,10)||1;
  STATE.botAvg=clampBotAvg((document.getElementById('cfgBotLevel')||{value:SETTINGS.botAvg}).value);
  const voice=(document.getElementById('cfgVoice')||{value:SETTINGS.voiceLang}).value;
  STATE.voiceLang=voice;voiceLang=voice;
  STATE.players=[];
  if(isPracticeMode()){
    STATE.players.push(createPlayer(practicePlayerName(),false));
    if(STATE.mode==='bobs27'){STATE.players[0].score=BOBS_START;STATE.players[0].scoreHistory=[BOBS_START]}
    STATE.maxTurns=STATE.mode==='highscore'?HIGHSCORE_TURNS:CATCH40_TURNS;
    STATE.lives=STATE.mode==='catch40'?CATCH40_LIVES:0;
    STATE.bobsRound=1;
  }else{
    STATE.maxTurns=0;STATE.lives=0;STATE.bobsRound=0;
    for(let i=1;i<=n;i++){const name=onlineNames?onlineNames[i-1]:(document.getElementById(`playerName${i}`).value.trim()||`Joueur ${i}`);STATE.players.push(createPlayer(name,false))}
    if(n===1)STATE.players.push(createPlayer('🤖 DartBot',true));
    STATE.cricketMarks={};STATE.aroundClock={};
    if(STATE.mode==='cricket')STATE.players.forEach((p,i)=>{STATE.cricketMarks[i]={20:0,19:0,18:0,17:0,16:0,15:0,25:0}});
    if(STATE.mode==='around')STATE.players.forEach((p,i)=>{STATE.aroundClock[i]=1});
  }
  STATE.currentPlayer=0;STATE.dartsThisTurn=[];STATE.currentMult=1;
  STATE.history=[];STATE.log=[];STATE.turnCount=0;STATE.gameOver=false;
  STATE.isBotTurn=false;STATE.botShowing=false;STATE.startTime=Date.now();STATE.throwHistory=[];
  showScreen('screenGame');buildBoard();applyQuickScoresVisibility();setInputMethod(SETTINGS.inputMethod);
  renderAll();saveGame();playEvent('start');maybeBotTurn();
}

/* ================== Pavé et cible ================== */
function buildBoard(){const grid=document.getElementById('boardGrid');grid.innerHTML='';if(STATE.mode==='cricket'){[20,19,18,17,16,15].forEach(n=>{const btn=document.createElement('button');btn.className='num-btn';btn.textContent=n;btn.onclick=()=>throwDart(n);grid.appendChild(btn)});const bull=document.createElement('button');bull.className='num-btn bull';bull.textContent='🎯 BULL (25)';bull.onclick=()=>throwDart(25);grid.appendChild(bull);const miss=document.createElement('button');miss.className='num-btn miss';miss.textContent='✕ Manqué (0)';miss.onclick=()=>throwDart(0);grid.appendChild(miss);return}
const order=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];order.forEach(n=>{const btn=document.createElement('button');btn.className='num-btn';btn.textContent=n;btn.onclick=()=>throwDart(n);grid.appendChild(btn)});const bull=document.createElement('button');bull.className='num-btn bull';bull.textContent='🎯 BULL (25)';bull.onclick=()=>throwDart(25);grid.appendChild(bull);const miss=document.createElement('button');miss.className='num-btn miss';miss.textContent='✕ Manqué (0)';miss.onclick=()=>throwDart(0);grid.appendChild(miss)}
function applyQuickScoresVisibility(){const qs=document.getElementById('quickScores');if(!qs)return;const blocked=['cricket','around','bobs27','catch40'].includes(STATE.mode)||STATE.doubleIn;qs.style.display=blocked?'none':'grid'}
function setMult(m){if(STATE.isBotTurn||STATE.gameOver)return;STATE.currentMult=m;document.querySelectorAll('.mult-btn').forEach(b=>b.classList.remove('selected'));const btn=document.querySelector(`.mult-btn[data-m="${m}"]`);if(btn)btn.classList.add('selected')}

/* ================== Volée en cours ================== */
function throwDart(baseValue,forcedMult){
  if(baseValue===25&&(forcedMult||STATE.currentMult)===3){showToast('Pas de triple Bull','error');setMult(1);return}
  if(window.NET&&NET.mode==='client'){
    const mult=forcedMult||STATE.currentMult;
    let value=baseValue===0?0:baseValue*mult,label='';
    if(baseValue===0)label='Manqué';else if(baseValue===25)label=mult===2?'DBull':'Bull';else label=(mult===2?'D':mult===3?'T':'')+baseValue;
    announceDart({baseValue,value,label,mult});
    NET.sendDart(baseValue,forcedMult);return
  }
  if(STATE.gameOver||STATE.isBotTurn||STATE.visitClosing)return;
  if(STATE.dartsThisTurn.length>=3)return;
  let value=baseValue,label='',mult=forcedMult||STATE.currentMult;
  if(baseValue===0){value=0;label='Manqué';mult=1}
  else if(baseValue===25){value=25*mult;label=mult===2?'DBull':mult===3?'Bull×3':'Bull'}
  else{value=baseValue*mult;label=(mult===2?'D':mult===3?'T':'')+baseValue}
  buzz(10);
  STATE.dartsThisTurn.push({baseValue,value,label,mult});
  announceDart(STATE.dartsThisTurn[STATE.dartsThisTurn.length-1]);
  setMult(1);renderDarts();renderStats();renderCheckout();
  if(STATE.dartsThisTurn.length===3){scheduleVisitEnd(450)}
  else if(isX01Mode()){const r=remainingAfterVisit();if(r<=0||(STATE.finishDouble&&r===1))scheduleVisitEnd(450)}
  else if(STATE.mode==='around'&&aroundTargetAfter(STATE.currentPlayer,STATE.dartsThisTurn)>21)scheduleVisitEnd(450);
}
function quickScore(total){
  if(window.NET&&NET.mode==='client'){netSend({t:'quick',value:total});return}
  if(STATE.gameOver||STATE.isBotTurn||STATE.visitClosing)return;
  if(['cricket','around','bobs27','catch40'].includes(STATE.mode))return;
  if(STATE.dartsThisTurn.length>0){showToast('Termine la volée en cours','error');return}
  buzz(14);
  STATE.dartsThisTurn=[{baseValue:-1,value:total,label:`Volée ${total}`,mult:1,ndarts:3}];
  renderDarts();scheduleVisitEnd(300);
}
let visitTimer=null,gameSession=0;
function scheduleVisitEnd(delay){STATE.visitClosing=true;const sid=gameSession;clearTimeout(visitTimer);visitTimer=setTimeout(()=>{if(sid!==gameSession)return;visitTimer=null;endTurn()},delay)}
function visitDarts(){return STATE.dartsThisTurn.reduce((s,d)=>s+(d.ndarts||1),0)}
function remainingAfterVisit(){return STATE.players[STATE.currentPlayer].score-STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0)}

/* ================== Fin de volée : dispatch par mode ================== */
function endTurn(){
  STATE.visitClosing=false;
  if(STATE.gameOver||STATE.dartsThisTurn.length===0)return;
  saveState();
  const player=STATE.players[STATE.currentPlayer];
  if(applyVisitResult(player)){STATE.isBotTurn=false;STATE.botShowing=false;return}
  /* Bot : on laisse le nouveau score affiché un moment avant de passer la main. */
  if(player.isBot&&STATE.isBotTurn&&BOT_DELAYS.next>0){
    STATE.botShowing=true;renderAll();
    const sid=gameSession;
    setTimeout(()=>{if(sid!==gameSession)return;STATE.isBotTurn=false;STATE.botShowing=false;finishVisitTurn()},BOT_DELAYS.next);
    return;
  }
  STATE.isBotTurn=false;
  finishVisitTurn();
}
function applyVisitResult(player){
  switch(STATE.mode){
    case 'cricket':return applyCricketResult(player);
    case 'around':return applyAroundResult(player);
    case 'bobs27':return applyBobsResult(player);
    case 'catch40':return applyCatch40Result(player);
    case 'highscore':return applyHighscoreResult(player);
    default:return applyX01Result(player);
  }
}
function finishVisitTurn(){
  STATE.botShowing=false;STATE.turnCount++;STATE.dartsThisTurn=[];
  STATE.currentPlayer=(STATE.currentPlayer+1)%STATE.players.length;
  renderAll();saveGame();
  const sid=gameSession;
  setTimeout(()=>{if(sid===gameSession)maybeBotTurn()},600);
}

/* ================== X01 (301/501/701/901/1001) ================== */
function applyX01Result(player){
  let eff=STATE.dartsThisTurn;
  let total=eff.reduce((s,d)=>s+d.value,0);
  /* Double-in : les fléchettes avant le premier double de la partie sont nulles. */
  if(STATE.doubleIn&&!player.started){
    const k=eff.findIndex(d=>d.mult===2);
    if(k>=0){player.started=true;eff=eff.slice(k);total=eff.reduce((s,d)=>s+d.value,0)}else{total=0}
  }
  const newScore=player.score-total;
  let isBust=false,logMsg='',logCls='';
  if(newScore<0){isBust=true;logMsg=`💥 BUST ${player.name} : ${total} (score négatif) — reste ${player.score}`;logCls='bust-log'}
  else if(newScore===1&&STATE.finishDouble){isBust=true;logMsg=`💥 BUST ${player.name} : ${total} (reste 1) — reste ${player.score}`;logCls='bust-log'}
  else if(newScore===0&&STATE.finishDouble){const last=eff[eff.length-1];if(!last||last.mult!==2){isBust=true;logMsg=`💥 BUST ${player.name} : finish sans double`;logCls='bust-log'}}
  if(STATE.finishDouble&&!eff.some(d=>d.ndarts)){let rem=player.score;for(const d of eff){if(rem===50||(rem>=2&&rem<=40&&rem%2===0))player.doublesAttempted++;rem-=d.value;if(rem<=1)break}
    if(newScore===0&&!isBust)player.doublesHit++}
  if(player.score<=CHECKOUT_MAX&&(CHECKOUTS[player.score]||!STATE.finishDouble)&&(!STATE.doubleIn||player.started))player.checkoutsAttempted++;
  const dartsBefore=player.dartsThrown;
  player.dartsThrown+=visitDarts();
  /* First 9 : points comptés sur les 9 premières fléchettes (bust = 0 point). */
  if(dartsBefore<9)player.first9=(player.first9||0)+(isBust?0:total);
  if(isBust){
    player.busts++;player.turns++;player.turnHistory.push(0);player.scoreHistory.push(player.score);
    STATE.log.unshift({msg:logMsg,cls:logCls});flashPlayerBust(STATE.currentPlayer);announceBust();showToast('💥 BUST !','error');
  }else{
    player.score=newScore;player.totalScored+=total;player.turns++;
    if(total>player.bestTurn)player.bestTurn=total;
    player.turnHistory.push(total);player.scoreHistory.push(newScore);
    if(total===180)player.count180++;if(total>=140)player.count140++;if(total>=100)player.count100++;if(total>=60)player.count60++;
    if(newScore===0){player.checkouts++;announceCheckout();
      logMsg=`🎯 CHECKOUT ${player.name} : ${eff.map(d=>d.label).join(' + ')} = ${total} !`;
      STATE.log.unshift({msg:logMsg,cls:'checkout-log'});
      STATE.throwHistory.push({player:player.name,darts:[...eff],total,bust:false,remaining:0});
      endGame(player);return true}
    netAnnounce(total,newScore);
    const turnLabels=eff.map(d=>d.label).join(' + ');
    logMsg=`${player.name} : ${turnLabels} = ${total} → reste ${newScore}`;
    if(total>=100){logCls='highlight';playEvent(total===180?'perfect':'big')}
    STATE.log.unshift({msg:logMsg,cls:logCls});
  }
  STATE.throwHistory.push({player:player.name,darts:[...eff],total,bust:isBust,remaining:player.score});
  return false;
}

/* ================== Cricket (+ cut-throat) ================== */
function closedCount(idx){const m=STATE.cricketMarks[idx];return m?Object.values(m).filter(v=>v>=3).length:0}
function isHighestScore(idx){const my=STATE.players[idx].score;return STATE.players.every((p,i)=>i===idx||p.score<=my)}
function isLowestScore(idx){const my=STATE.players[idx].score;return STATE.players.every((p,i)=>i===idx||p.score>=my)}
function applyCricketResult(player){
  const idx=STATE.currentPlayer,marks=STATE.cricketMarks[idx],targets=[20,19,18,17,16,15,25];
  let scored=0,dealt=0;
  STATE.dartsThisTurn.forEach(dart=>{
    const target=dart.baseValue;
    if(!targets.includes(target))return;
    const cur=marks[target]||0,mkAfter=cur+(dart.mult||1);
    marks[target]=Math.min(3,mkAfter);
    const extra=mkAfter-3;
    if(extra<=0)return;
    if(STATE.cutThroat){
      /* Cut-throat : les points vont aux adversaires qui n'ont pas fermé la cible. */
      STATE.players.forEach((p,i)=>{if(i!==idx&&(STATE.cricketMarks[i][target]||0)<3){p.score+=extra*target;dealt+=extra*target}});
    }else{
      const allClosed=STATE.players.every((p,i)=>i===idx||(STATE.cricketMarks[i][target]||0)>=3);
      if(!allClosed)scored+=extra*target;
    }
  });
  player.turns++;player.dartsThrown+=STATE.dartsThisTurn.length;
  if(!STATE.cutThroat)player.score+=scored;
  const gained=STATE.cutThroat?dealt:scored;
  /* Stats MOY/MEILLEUR : en cricket on totalise les points marqués (ou les
     dégâts infligés en cut-throat), sinon MOY restait bloquée à 0. */
  player.totalScored+=gained;
  if(gained>player.bestTurn)player.bestTurn=gained;
  player.turnHistory.push(gained);
  STATE.log.unshift({msg:`${player.name} : ${STATE.dartsThisTurn.map(d=>d.label).join(' + ')}${scored?' → +'+scored:''}${STATE.cutThroat?' (cut-throat)':''}`,cls:scored>=20?'highlight':''});
  const allClosed=targets.every(t=>(marks[t]||0)>=3);
  const winOnBoard=STATE.cutThroat?isLowestScore(idx):isHighestScore(idx);
  if(allClosed&&winOnBoard){endGame(player);return true}
  return false;
}

/* ================== Around the Clock (simples 1, doubles 2, triples 3) ================== */
function aroundHit(d,target,need){if(target>20)return d.baseValue===25&&(need===1||d.mult===2);return d.baseValue===target&&(need===1||d.mult===need)}
function aroundTargetAfter(idx,darts){let c=STATE.aroundClock[idx]||1;const need=STATE.aroundVariant||1;darts.forEach(d=>{if(c<=21&&aroundHit(d,c,need))c++});return c}
function applyAroundResult(player){
  const idx=STATE.currentPlayer,start=STATE.aroundClock[idx]||1,need=STATE.aroundVariant||1;
  const end=aroundTargetAfter(idx,STATE.dartsThisTurn);
  STATE.aroundClock[idx]=end;
  player.turns++;player.dartsThrown+=STATE.dartsThisTurn.length;player.score+=end-start;
  const lbl=v=>v>20?'BULL':v;
  STATE.log.unshift({msg:`${player.name} : ${lbl(start)} → ${end>21?'TERMINÉ':lbl(end)}${end>start?' (+'+(end-start)+')':' ✗'}`,cls:end>start?'highlight':''});
  if(end>21){endGame(player);return true}
  return false;
}

/* ================== Bob's 27 ================== */
/* 20 tours : tour r, cible Double r (20 : Double Bull). Chaque touche +2r
   (+50 pour DBull). Volée entièrement manquée : -2r. Score <= 0 : échec. */
function applyBobsResult(player){
  const round=STATE.bobsRound;
  const target=round>=BOBS_ROUNDS?25:round;
  const worth=target===25?50:target*2;
  let hits=0;
  STATE.dartsThisTurn.forEach(d=>{if(d.mult===2&&d.baseValue===target)hits++});
  player.turns++;player.dartsThrown+=3;
  const delta=hits>0?hits*worth:-worth;
  if(delta>0){player.totalScored+=delta;if(delta>player.bestTurn)player.bestTurn=delta}
  player.score+=delta;
  player.turnHistory.push(delta);
  STATE.log.unshift({msg:`Bob's 27 · D${target} : ${hits?'+'+delta:delta+' (raté)'}`,cls:hits?'highlight':'bust-log'});
  if(player.score<=0){endPractice(player,false,`Échec au tour ${round} (Double ${target})`);return true}
  if(round>=BOBS_ROUNDS){endPractice(player,player.score>0,`Score final : ${player.score} (objectif 100)`);return true}
  STATE.bobsRound++;
  return false;
}

/* ================== Catch 40 ================== */
/* 10 volées de 3 darts. Une volée de moins de 40 coûte une vie (3 au départ).
   0 vie : échec. 10 volées tenues : réussite. */
function applyCatch40Result(player){
  const total=STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);
  player.turns++;player.dartsThrown+=3;
  player.score+=total;player.totalScored+=total;
  if(total>player.bestTurn)player.bestTurn=total;
  player.turnHistory.push(total);player.scoreHistory.push(player.score);
  if(total===180)player.count180++;if(total>=100)player.count100++;
  if(total<CATCH40_MIN)STATE.lives--;
  STATE.log.unshift({msg:`Catch 40 · volée ${player.turns} : ${total}${total<CATCH40_MIN?` — vie perdue (${STATE.lives} restantes)`:''}`,cls:total<CATCH40_MIN?'bust-log':'highlight'});
  if(STATE.lives<=0){endPractice(player,false,`Volée sous ${CATCH40_MIN} : ${total} points`);return true}
  if(player.turns>=CATCH40_TURNS){endPractice(player,true,`Total : ${player.score} en ${CATCH40_TURNS} volées`);return true}
  return false;
}

/* ================== Highscore (10 volées cumulées) ================== */
function applyHighscoreResult(player){
  const total=STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);
  player.turns++;player.dartsThrown+=3;
  player.score+=total;player.totalScored+=total;
  if(total>player.bestTurn)player.bestTurn=total;
  player.turnHistory.push(total);player.scoreHistory.push(player.score);
  if(total===180)player.count180++;if(total>=140)player.count140++;if(total>=100)player.count100++;if(total>=60)player.count60++;
  STATE.log.unshift({msg:`Highscore volée ${player.turns} : ${total}`,cls:total>=100?'highlight':''});
  if(player.turns>=HIGHSCORE_TURNS){endPractice(player,true,`Total : ${player.score} en ${HIGHSCORE_TURNS} volées`);return true}
  return false;
}

/* ================== Bot (moyenne visée 20-120) ================== */
/* hT : proba de toucher un triple visé, hD un double visé, hB le bull double.
   Calage : hT=(moy/3 - 5)/56 -> la moyenne de 3 fléchettes converge vers botAvg
   sur le jeu générique (T20 visé, retour sur 20/5/1, manques). */
function botSkill(avg){const hT=Math.max(.02,Math.min(.72,(avg/3-5)/56));return{hT,hD:Math.max(.08,Math.min(.56,hT*.78+.03)),hB:Math.max(.04,Math.min(.34,hT*.6+.02))}}
function mkDart(base,mult,labelOverride){const value=base*mult;const label=labelOverride||(mult===2?(base===25?'DBull':'D'+base):mult===3?'T'+base:String(base));return{baseValue:base,value,label,mult}}
function mkMiss(){return{baseValue:0,value:0,label:'Manqué',mult:1}}
/* Tente un jeton de route de checkout : réussite probabiliste, échec = retour simple ou manqué. */
function botRouteDart(tok,avg){
  const s=botSkill(avg);
  let base=0,mult=1;
  if(tok==='Bull'){base=25;mult=1}else if(tok==='DBull'){base=25;mult=2}
  else{mult=tok[0]==='T'?3:tok[0]==='D'?2:1;base=parseInt((mult>1?tok.slice(1):tok),10)}
  const r=Math.random();
  const p=mult===3?s.hT:mult===2?(base===25?s.hB:s.hD):Math.min(.9,.5+s.hT);
  if(r<p)return mkDart(base,mult);
  /* Echec de visée : le dart touche surtout la simple du secteur (jamais un 0 sec),
     un dart adjacent parfois, un manque rarement — comme un vrai lanceur. */
  const r2=Math.random();
  if(mult===2)return r2<.78?mkDart(base,1):r2<.9?mkDart(base===25?25:Math.max(1,base-2),1):mkMiss();
  if(mult===3)return r2<.68?mkDart(base,1):r2<.8?mkDart(Math.random()<.5?5:1,1):mkMiss();
  return Math.random()<.75?mkDart(Math.max(1,base-2),1):mkDart(1,1);
}
/* Jeu générique (pas de checkout visable) : triple/singles/1/5/manques. */
function botGenericDart(avg){
  const s=botSkill(avg),n=botScoringTarget(avg);
  const i=BOARD_ORDER.indexOf(n),nb=[BOARD_ORDER[(i+19)%20],BOARD_ORDER[(i+1)%20]];
  /* Calibration conservée : espérance 3n·hT + a·n + b·voisins = avg/3 quelle que soit la cible. */
  const k=Math.max(0,(avg/3-3*n*s.hT)/(2*n/3+(nb[0]+nb[1])/6));
  const a=k*2/3,b=k/3;
  const r=Math.random();
  if(r<s.hT)return mkDart(n,3);
  if(r<s.hT+a)return mkDart(n,1);
  if(r<s.hT+a+b)return mkDart(nb[Math.random()<.5?0:1],1);
  return mkMiss();
}
/* Cible de marquage du bot (numéro 20/19/18/17) : tirée à chaque volée (T20
   majoritaire, plus de dispersion aux petits niveaux), changée après des ratés
   dans la volée, et après une volée blanche sur la même cible. */
const botAim={};
function botScoringTarget(avg){
  const idx=STATE.currentPlayer,key=gameSession+':'+STATE.turnCount+':'+idx;
  const lvl=avg>=80?0:avg>=55?1:2;
  const W=[[.74,.16,.06,.04],[.6,.22,.11,.07],[.44,.26,.17,.13]][lvl],B=[20,19,18,17];
  const pick=ex=>{const ws=B.map((b,i)=>b===ex?0:W[i]);let r=Math.random()*ws.reduce((x,y)=>x+y,0);for(let i=0;i<4;i++){r-=ws[i];if(r<0)return B[i]}return 20};
  const darts=STATE.dartsThisTurn||[],last=darts[darts.length-1];
  let a=botAim[idx];
  if(!a||a.key!==key){
    const poor=a&&a.seen>=2&&a.hits===0;
    a=botAim[idx]={key,base:poor&&Math.random()<.6?pick(a.base):pick(),miss:0,hits:0,seen:0};
  }else if(last){
    a.seen++;
    if(last.baseValue===a.base)a.hits++;
    else if(++a.miss>=(lvl===2?1:2)&&Math.random()<(lvl===2?.6:.45)){a.base=pick(a.base);a.miss=0}
    if(lvl===2&&Math.random()<.12)a.base=pick(a.base);
  }
  return a.base;
}
function botDart(remaining,used,avg){
  /* Même route que l'affichage (checkoutRoute) : tient compte des fléchettes restantes. */
  const route=checkoutRoute(remaining,3-used,STATE.finishDouble);
  if(route&&(remaining<=66||Math.random()<Math.min(.95,.7+avg/200)))return botRouteDart(route.split(' ')[0],avg);
  /* Défense anti-bust : en double out, au-dessous de 67, viser uniquement ce qui
     garde un score finissable (≥2, en paire) — jamais un dart de bombé. */
  if(STATE.finishDouble&&remaining>1&&remaining<=66){
    if(remaining<=40&&remaining%2===0)return botRouteDart('D'+(remaining/2),avg);
    if(remaining===50)return botRouteDart('DBull',avg);
    let s;
    if(remaining<=40)s=remaining%2===1?(remaining>=17?remaining-16:remaining-2):10;
    else if(remaining<=60)s=remaining-40;
    else s=20;
    return botRouteDart(String(s),avg);
  }
  if(!STATE.finishDouble&&remaining<=20)return botRouteDart(String(remaining),avg);
  if(STATE.finishDouble&&used<2&&remaining>2&&remaining<=40&&remaining%2===0&&Math.random()<.5)return botRouteDart('D'+(remaining/2),avg);
  if(remaining>=60&&Math.random()<Math.max(0,(avg-20)/120))return botRouteDart('T20',avg);
  if(!STATE.finishDouble&&remaining===1)return botRouteDart('1',avg);
  return botGenericDart(avg);
}
function simulateAroundDart(avg,target){
  const s=botSkill(avg);
  const need=STATE.aroundVariant||1;
  const bullRound=target>20;
  const hitProb=bullRound?(need===2?s.hB:Math.min(.6,.3+avg/300)):(need===1?Math.min(.85,.4+s.hT+.25):need===2?Math.min(.6,s.hD*1.8):Math.max(.06,s.hT*.8));
  if(Math.random()<hitProb)return bullRound?mkDart(25,need):mkDart(target,need);
  if(Math.random()<.25)return mkMiss();
  return mkDart(Math.floor(Math.random()*20)+1,1);
}
/* Bot cricket : vise les cibles utiles (20→15, Bull), triple probable, ferme
   puis marque sur les cibles encore ouvertes chez les adversaires. */
function botCricketDart(avg){
  const idx=STATE.currentPlayer,marks=STATE.cricketMarks[idx]||{};
  const targets=[20,19,18,17,16,15,25];
  const oppOpen=t=>STATE.players.some((p,i)=>i!==idx&&(STATE.cricketMarks[i][t]||0)<3);
  let cands=targets.filter(oppOpen);
  if(!cands.length)cands=targets.slice();
  const target=cands.find(t=>(marks[t]||0)<3)!==undefined?cands.find(t=>(marks[t]||0)<3):cands[0];
  const s=botSkill(avg);
  const isBull=target===25;
  const r=Math.random();
  const p3=isBull?s.hB:Math.min(.55,s.hT);
  if(r<p3)return mkDart(target,isBull?2:3);
  if(r<p3+.6)return mkDart(target,1);
  if(r<p3+.82&&!isBull&&target>10)return mkDart(target-1,1);
  return mkMiss();
}
function maybeBotTurn(){
  if(STATE.gameOver)return;
  const player=STATE.players[STATE.currentPlayer];
  if(!player||!player.isBot)return;
  STATE.isBotTurn=true;renderAll();
  const avg=STATE.botAvg||BOT_DEFAULT;
  let count=STATE.dartsThisTurn.length;const sid=gameSession;
  const throwNext=()=>{
    if(sid!==gameSession)return;
    if(count>=3||STATE.gameOver){setTimeout(()=>{if(sid!==gameSession)return;endTurn()},BOT_DELAYS.end);return}
    const remaining=player.score-STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);
    const dart=STATE.mode==='around'
      ?simulateAroundDart(avg,aroundTargetAfter(STATE.currentPlayer,STATE.dartsThisTurn))
      :STATE.mode==='cricket'
        ?botCricketDart(avg)
        :botDart(remaining,STATE.dartsThisTurn.length,avg);
    STATE.dartsThisTurn.push(dart);renderDarts();announceDart(dart);count++;
    if(isX01Mode()){const r=remaining-dart.value;if(r<=0||(STATE.finishDouble&&r===1))count=3}
    else if(STATE.mode==='around'&&aroundTargetAfter(STATE.currentPlayer,STATE.dartsThisTurn)>21)count=3;
    setTimeout(throwNext,BOT_DELAYS.dart);
  };
  setTimeout(throwNext,BOT_DELAYS.start);
}

/* ================== Undo / passer / quitter ================== */
function saveState(){STATE.history.push({players:JSON.parse(JSON.stringify(STATE.players)),currentPlayer:STATE.currentPlayer,log:JSON.parse(JSON.stringify(STATE.log)),turnCount:STATE.turnCount,throwHistory:JSON.parse(JSON.stringify(STATE.throwHistory)),cricketMarks:JSON.parse(JSON.stringify(STATE.cricketMarks)),aroundClock:JSON.parse(JSON.stringify(STATE.aroundClock)),darts:JSON.parse(JSON.stringify(STATE.dartsThisTurn)),bobsRound:STATE.bobsRound,lives:STATE.lives});if(STATE.history.length>100)STATE.history.shift()}
function undoLast(){
  if(window.NET&&NET.mode==='client'){netSend({t:'undo'});return}
  if(STATE.isBotTurn)return;
  if(STATE.gameOver){showToast('Partie terminée','error');return}
  if(STATE.visitClosing){clearTimeout(visitTimer);visitTimer=null;STATE.visitClosing=false}
  /* Une fléchette à la fois : d'abord celles de la volée en cours… */
  if(STATE.dartsThisTurn.length>0){STATE.dartsThisTurn.pop();renderAll();saveGame();return}
  if(STATE.history.length===0){showToast('Rien à annuler','error');return}
  /* …puis on rouvre la volée précédente (état d'avant la volée + ses fléchettes
     sauf la dernière). Les volées du bot sont sautées : retour à la dernière
     fléchette humaine. */
  let prev=STATE.history.pop();
  const isBotSnap=h=>!!(h.players[h.currentPlayer]&&h.players[h.currentPlayer].isBot);
  while(isBotSnap(prev)&&STATE.history.length)prev=STATE.history.pop();
  STATE.players=prev.players;STATE.currentPlayer=prev.currentPlayer;STATE.log=prev.log;
  STATE.turnCount=prev.turnCount;STATE.throwHistory=prev.throwHistory;
  STATE.cricketMarks=prev.cricketMarks;STATE.aroundClock=prev.aroundClock;
  if(prev.bobsRound!==undefined)STATE.bobsRound=prev.bobsRound;
  if(prev.lives!==undefined)STATE.lives=prev.lives;
  STATE.botShowing=false;
  const darts=prev.darts||[];
  /* Volée saisie d'un bloc (quickScore) ou « passé » : rien à remettre. */
  STATE.dartsThisTurn=isBotSnap(prev)||darts.some(d=>d.ndarts||d.label==='Passé')?[]:darts.slice(0,-1);
  renderAll();saveGame();showToast('↩️ Annulé','success');
  if(isBotSnap(prev)){const sid=gameSession;setTimeout(()=>{if(sid===gameSession)maybeBotTurn()},600)}
}
function skipTurn(){
  if(window.NET&&NET.mode==='client'){netSend({t:'pass'});return}
  if(STATE.gameOver||STATE.isBotTurn)return;
  if(STATE.dartsThisTurn.length===0)STATE.dartsThisTurn=[{baseValue:0,value:0,label:'Passé',mult:1}];
  endTurn();
}
function confirmQuit(){
  if(confirm('Quitter la partie en cours ?')){
    gameSession++;visitTimer=null;STATE.visitClosing=false;STATE.isBotTurn=false;STATE.botShowing=false;
    saveGame();
    if(window.NET&&NET.ws){NET.started=false;try{NET.ws.close()}catch(e){}NET.ws=null}
    showScreen('screenSetup');
  }
}

/* ================== Fin de partie / entraînement ================== */
let winnerRef=null;
function showWinnerOverlay(player,titleText,subText){
  document.getElementById('winnerName').textContent=titleText;
  document.getElementById('winnerSub').textContent=subText;
  const s=matchSummary(player);
  const cards=[{v:s.avg,l:'Moy. / volée'},{v:player.bestTurn,l:'Meilleure'}];
  if(s.first9!=null)cards.push({v:s.first9,l:'First 9'});
  if(s.mpr!=null)cards.push({v:s.mpr,l:'MPR'});
  cards.push({v:s.dbl+'%',l:'Doubles'},{v:s.busts,l:'Busts'},{v:s.c180,l:'180'});
  /* Dernière volée en memoire pour le partage (joueur mis en avant). */
  winnerRef=player;
  document.getElementById('winnerStats').innerHTML=cards.map(c=>`<div class="stat-card"><div class="sc-val">${c.v}</div><div class="sc-lbl">${c.l}</div></div>`).join('');
  renderScoreChart(player);
  document.getElementById('winnerOverlay').classList.add('active');
}
function shareMatchStats(){
  if(!winnerRef)return;
  const text=matchSummaryText(winnerRef,`Perfect Darts — ${fmtMode(STATE.mode)}`);
  const nav=(typeof navigator!=='undefined')?navigator:(window&&window.navigator);
  if(nav&&typeof nav.share==='function'){nav.share({title:'Perfect Darts',text}).catch(()=>{try{nav.clipboard.writeText(text);showToast('Stats copiées','success')}catch(e){}})}
  else if(nav&&nav.clipboard&&nav.clipboard.writeText){nav.clipboard.writeText(text);showToast('Stats copiées','success')}
  else showToast('Partage non disponible','error');
}
function endGame(winner){
  STATE.gameOver=true;playEvent('win',winner.name);
  /* MPR cricket : moyenne de marques par tour. */
  if(STATE.mode==='cricket'&&STATE.cricketMarks){
    STATE.players.forEach((p,i)=>{const m=STATE.cricketMarks[i];if(!m)return;
      const marks=Object.values(m).reduce((s,v)=>s+Math.min(v,3),0);p.mpr=p.turns?Math.round(10*marks/p.turns)/10:0});
  }
  const duration=Math.floor((Date.now()-STATE.startTime)/1000);
  const mins=Math.floor(duration/60),secs=duration%60;
  showWinnerOverlay(winner,`${winner.name} a gagné !`,`${fmtMode(STATE.mode)} · ${winner.turns} volées · ${mins}m${secs.toString().padStart(2,'0')}s`);
  recordGameToCareer(winner,{duration});
  saveGame();updateResumeBtn();
}
function endPractice(player,success,sub){
  STATE.gameOver=true;playEvent(success?'win':'big');
  showWinnerOverlay(player,success?`${player.name} a réussi !`:'Échec…',`${fmtMode(STATE.mode)} · ${sub}`);
  saveGame();updateResumeBtn();
}
function backToSetup(){document.getElementById('winnerOverlay').classList.remove('active');try{localStorage.removeItem(STORAGE_KEY)}catch(e){}showScreen('screenSetup');updateResumeBtn();updatePlayerInputs()}

/* ================== Graphique (overlay victoire) ================== */
function renderScoreChart(player){
  const canvas=document.getElementById('chartScore');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const data=player.scoreHistory;
  if(data.length<2||!isX01Mode())return;
  const maxScore=STATE.mode;
  const padding=30,chartW=W-padding*2,chartH=H-padding*2;
  ctx.strokeStyle='rgba(255,255,255,0.05)';
  for(let i=0;i<=4;i++){const y=padding+(chartH/4)*i;ctx.beginPath();ctx.moveTo(padding,y);ctx.lineTo(W-padding,y);ctx.stroke()}
  ctx.strokeStyle='#ff6b35';ctx.lineWidth=2.5;
  ctx.beginPath();
  data.forEach((v,i)=>{const x=padding+(chartW/(data.length-1))*i;const y=padding+chartH-(v/maxScore)*chartH;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});
  ctx.stroke();
  ctx.fillStyle='#8892b0';ctx.font='10px system-ui';ctx.textAlign='left';
  ctx.fillText(String(maxScore),4,padding+4);ctx.fillText('0',4,H-padding+4);
}

/* ================== Sauvegarde / reprise ================== */
function saveGame(){
  try{
    const save={players:STATE.players,currentPlayer:STATE.currentPlayer,mode:STATE.mode,
      finishDouble:STATE.finishDouble,doubleIn:STATE.doubleIn,cutThroat:STATE.cutThroat,
      aroundVariant:STATE.aroundVariant,botAvg:STATE.botAvg,
      maxTurns:STATE.maxTurns,lives:STATE.lives,bobsRound:STATE.bobsRound,
      voiceLang:STATE.voiceLang,dartsThisTurn:STATE.dartsThisTurn,
      history:STATE.history.slice(-30),log:STATE.log.slice(0,30),turnCount:STATE.turnCount,
      gameOver:STATE.gameOver,startTime:STATE.startTime,throwHistory:STATE.throwHistory,
      cricketMarks:STATE.cricketMarks,aroundClock:STATE.aroundClock};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(save));
    updateResumeBtn();
  }catch(e){}
}
function loadGameSave(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch(e){return null}}
function resumeSavedGame(){
  const save=loadGameSave();
  if(!save){showToast('Aucune partie sauvegardée','error');return}
  if(save.gameOver){showToast('La partie est terminée','error');return}
  Object.assign(STATE,{players:save.players||[],currentPlayer:save.currentPlayer||0,mode:save.mode,finishDouble:save.finishDouble,doubleIn:!!save.doubleIn,cutThroat:!!save.cutThroat,aroundVariant:save.aroundVariant||1,botAvg:clampBotAvg(save.botAvg),maxTurns:save.maxTurns||0,lives:save.lives||0,bobsRound:save.bobsRound||0,voiceLang:save.voiceLang,dartsThisTurn:save.dartsThisTurn||[],botShowing:false,isBotTurn:false,history:save.history||[],log:save.log||[],turnCount:save.turnCount,gameOver:false,startTime:save.startTime,throwHistory:save.throwHistory||[],cricketMarks:save.cricketMarks||{},aroundClock:save.aroundClock||{}});
  voiceLang=STATE.voiceLang;
  showScreen('screenGame');buildBoard();applyQuickScoresVisibility();setInputMethod(SETTINGS.inputMethod);renderAll();
  if(STATE.dartsThisTurn.length>=3){endTurn()}else{maybeBotTurn()}
}
function updateResumeBtn(){
  const save=loadGameSave();
  const btn=document.getElementById('resumeBtn');
  if(!btn)return;
  const ok=save&&!save.gameOver&&Array.isArray(save.players)&&save.players.length&&save.players[0]&&save.players[0].name;
  if(!ok){btn.style.display='none';return}
  btn.style.display='inline-flex';
  btn.textContent=`🔄 Reprendre : ${save.players[0].name}${save.players[1]?' vs '+save.players[1].name:''}`;
}

/* ================== Leader et libellés ================== */
function getLeaderIndex(){
  if(STATE.mode==='cricket'){
    /* Cut-throat : le meneur est celui qui a le PLUS PETIT score. */
    let best=0,bestScore=null;
    STATE.players.forEach((p,i)=>{
      const s=(STATE.cutThroat?-1:1)*(p.score*10+closedCount(i));
      if(bestScore===null||s>bestScore){bestScore=s;best=i}
    });
    return best;
  }
  if(STATE.mode==='around'){
    let best=0,bestVal=-1;
    STATE.players.forEach((p,i)=>{if((STATE.aroundClock[i]||0)>bestVal){bestVal=STATE.aroundClock[i];best=i}});
    return best;
  }
  let best=0,bestVal=Infinity;
  STATE.players.forEach((p,i)=>{if(p.score<bestVal&&p.score>0){bestVal=p.score;best=i}});
  return best;
}
function hudTurnLabel(){
  const p=STATE.players[STATE.currentPlayer];
  if(!p)return'Tour de —';
  if(STATE.gameOver)return'Terminé';
  if(STATE.mode==='bobs27')return`Bob's 27 · Double ${STATE.bobsRound>=BOBS_ROUNDS?'Bull':STATE.bobsRound} · volée ${p.turns+1}/${BOBS_ROUNDS}`;
  if(STATE.mode==='catch40')return`Catch 40 · ${'♥'.repeat(Math.max(0,STATE.lives))||'—'} · volée ${p.turns+1}/${CATCH40_TURNS}`;
  if(STATE.mode==='highscore')return`Highscore ${p.turns+1}/${HIGHSCORE_TURNS}`;
  return'Tour de '+p.name;
}
