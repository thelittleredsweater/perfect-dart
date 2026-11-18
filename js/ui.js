'use strict';
function renderAll(){renderHUD();renderDarts();renderStats();renderCheckout();renderLog();renderModeLabel();renderCricketBoard();if(window.NET&&NET.onRender)NET.onRender()}
/* Cricket : grille des marques par cible et par joueur (X, XX, ferme = accent). */
function renderCricketBoard(){
  const el=document.getElementById('cricketBoard');
  if(!el)return;
  if(STATE.mode!=='cricket'||!STATE.players.length){el.classList.add('hidden');el.innerHTML='';return}
  el.classList.remove('hidden');
  const rows=[20,19,18,17,16,15,25];
  const sym=m=>m>=3?'◉':m===2?'X X':m===1?'X':'·';
  el.innerHTML=`<div class="cb-row cb-head"><span class="cb-t"></span>${STATE.players.map(p=>`<span class="cb-p">${escapeHtml(p.name.slice(0,5))}</span>`).join('')}</div>`
    +rows.map(num=>`<div class="cb-row"><span class="cb-t">${num===25?'Bull':num}</span>${STATE.players.map((p,i)=>{const m=(STATE.cricketMarks[i]||{})[num]||0;return`<span class="cb-m${m>=3?' closed':''}">${sym(m)}</span>`}).join('')}</div>`).join('');
}
function renderHUD(){const container=document.getElementById('hudScores');container.innerHTML='';const leaderIdx=getLeaderIndex();STATE.players.forEach((p,i)=>{const card=document.createElement('div');card.className='hud-player'+(i===STATE.currentPlayer&&!STATE.gameOver?' active':'');let scoreDisplay=p.score,scoreClass='';if(typeof STATE.mode==='number'){if(p.score<=170&&p.score>1&&CHECKOUTS[p.score])scoreClass='checkout';else if(p.score<=40)scoreClass='low'}if(STATE.mode==='cricket'&&STATE.cricketMarks[i]){const closed=Object.values(STATE.cricketMarks[i]).filter(m=>m>=3).length;scoreDisplay=`${p.score} (${closed}/7)`}if(STATE.mode==='around'&&STATE.aroundClock[i]){scoreDisplay=STATE.aroundClock[i]>20?'BULL':STATE.aroundClock[i]}if(STATE.mode==='bobs27'){scoreDisplay=`${p.score} · D${STATE.bobsRound>=BOBS_ROUNDS?'BULL':STATE.bobsRound}`}if(STATE.mode==='catch40'){scoreDisplay=`${p.score} · ${'♥'.repeat(Math.max(0,STATE.lives))||'—'}`}const crown=(i===leaderIdx&&STATE.players.length>1)?'<span class="crown">👑</span>':'';card.innerHTML=`${crown}<div class="h-name">${escapeHtml(p.name)}</div><div class="h-score ${scoreClass}">${scoreDisplay}</div>`;container.appendChild(card)});const activeCards=container.querySelectorAll('.hud-player.active');if(activeCards.length){const a=activeCards[0];const target=a.offsetLeft-(container.clientWidth-a.offsetWidth)/2;try{container.scrollTo({left:Math.max(0,target),behavior:'smooth'})}catch(e){container.scrollLeft=Math.max(0,target)}}const turnEl=document.getElementById('hudTurn');turnEl.textContent=hudTurnLabel()}
function renderModeLabel(){const el=document.getElementById('hudMode');if(!el)return;if(typeof STATE.mode==='number')el.textContent=`${STATE.mode} · ${STATE.finishDouble?'DOUBLE OUT':'STRAIGHT OUT'}`;else el.textContent=fmtMode(STATE.mode).toUpperCase()}
function renderDarts(){for(let i=0;i<3;i++){const slot=document.getElementById(`slot${i}`);if(!slot)continue;const dart=STATE.dartsThisTurn[i];slot.className='dart-slot';if(dart){slot.classList.add('filled');if(dart.mult===2)slot.classList.add('double');if(dart.mult===3)slot.classList.add('triple');slot.innerHTML=`<div class="dart-value">${dart.value}</div><div class="dart-label">${dart.label}</div>`}else{slot.innerHTML='—'}}}
function renderStats(){const p=STATE.players[STATE.currentPlayer];if(!p)return;document.getElementById('statAvg').textContent=p.turns?Math.round(p.totalScored/p.turns):0;document.getElementById('statTurns').textContent=p.turns;document.getElementById('statBest').textContent=p.bestTurn||0}
function renderCheckout(){const box=document.getElementById('checkoutBox');const routeEl=document.getElementById('checkoutRoute');if(!box)return;if(typeof STATE.mode!=='number'||STATE.gameOver){box.classList.remove('active');return}const p=STATE.players[STATE.currentPlayer];if(!p)return;const currentTotal=STATE.dartsThisTurn.reduce((s,d)=>s+d.value,0);const remaining=p.score-currentTotal;if(remaining<=170&&remaining>1&&CHECKOUTS[remaining]){const wasActive=box.classList.contains('active');routeEl.textContent=CHECKOUTS[remaining];box.classList.add('active');if(!wasActive&&remaining<=40&&!(window.NET&&NET.mode==='client'))playEvent('checkout')}else{box.classList.remove('active')}}
function renderLog(){const panel=document.getElementById('logPanel');if(!panel)return;panel.innerHTML=STATE.log.slice(0,12).map(e=>`<div class="log-entry ${e.cls||''}">${escapeHtml(e.msg)}</div>`).join('')}
function toggleLog(){const panel=document.getElementById('logPanel');if(!panel)return;const hidden=panel.classList.toggle('hidden');const btn=document.getElementById('logToggleBtn');if(btn)btn.textContent=hidden?'📜 Historique':'📜 Masquer l\'historique'}
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');window.scrollTo(0,0)}
function flashPlayerBust(idx){const cards=document.querySelectorAll('.hud-player');if(cards[idx]){cards[idx].classList.add('bust-flash');setTimeout(()=>cards[idx].classList.remove('bust-flash'),700)}}
let toastTimer=null;function showToast(msg,type=''){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show '+type;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
function updateMuteBtn(){const b=document.getElementById('muteBtn');if(b)b.textContent=SETTINGS.voiceLang==='off'?'🔇 Voix':'🔊 Voix'}
function toggleMute(){if(SETTINGS.voiceLang==='off'){SETTINGS.voiceLang=SETTINGS.prevVoice||'fr'}else{SETTINGS.prevVoice=SETTINGS.voiceLang;SETTINGS.voiceLang='off'}voiceLang=SETTINGS.voiceLang;saveSettings();try{if(voiceSynth)voiceSynth.cancel();if(lastAudio){lastAudio.pause();lastAudio=null}stopRemote()}catch(e){}updateMuteBtn();showToast(SETTINGS.voiceLang==='off'?'Voix désactivée':'Voix activée','success')}
function applyModeFieldVisibility(){const mode=document.getElementById('cfgMode').value;const x01=!['cricket','around','bobs27','catch40','highscore'].includes(mode);const practice=PRACTICE_MODES.includes(mode);const fFinish=document.getElementById('fieldFinish');if(fFinish)fFinish.style.display=x01?'':'none';const fBot=document.getElementById('fieldBot');if(fBot)fBot.style.display=(PLAYER_COUNT===1&&!practice)?'':'none';const fDI=document.getElementById('fieldDoubleIn');if(fDI)fDI.style.display=x01?'':'none';const fCT=document.getElementById('fieldCutThroat');if(fCT)fCT.style.display=mode==='cricket'?'':'none';const fAV=document.getElementById('fieldAround');if(fAV)fAV.style.display=mode==='around'?'':'none';const cp=document.getElementById('cardPlayers');if(cp)cp.style.display=practice?'none':'';updateRulesBox()}
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
function openSettings(){loadSettings();[document.getElementById('setTheme'),document.getElementById('setAccent'),document.getElementById('setVoice')].forEach(el=>{if(el)el.value=''});document.getElementById('setTheme').value=SETTINGS.theme==='light'?'light':'dark';document.getElementById('setAccent').value=SETTINGS.accent;const ol=document.getElementById('setOled');if(ol)ol.value=SETTINGS.oled?'1':'';document.getElementById('setVoice').value=SETTINGS.voiceLang;const st=document.getElementById('voiceStatusHost');if(st){const vs=voiceStatus();st.textContent=vs==='no-api'?'ℹ️ Synthèse locale indisponible sur cet appareil : la voix passe par Internet (connexion requise).':vs==='no-voice'?'⚠️ Aucune voix TTS détectée — installe ou réactive la synthèse vocale du téléphone (service Google de synthèse vocale)':'✅ Synthèse vocale OK';}const g=document.getElementById('setGender');if(g)g.value=SETTINGS.voiceGender||'female';const snd=document.getElementById('setSounds');if(snd)snd.value=SETTINGS.sounds?'1':'';const vol=document.getElementById('setVolume');if(vol)vol.value=String(SETTINGS.volume!=null?SETTINGS.volume:0.5);document.getElementById('setInput').value=SETTINGS.inputMethod;document.getElementById('setVib').value=SETTINGS.vibration?'1':'';showScreen('screenSettings')}
function clearSavedGame(){if(!confirm('Effacer la partie sauvegardée ?'))return;try{localStorage.removeItem(STORAGE_KEY)}catch(e){}updateResumeBtn();showToast('Sauvegarde effacée','success')}
function persistSettings(){SETTINGS.theme=(document.getElementById('setTheme').value==='light')?'light':'dark';SETTINGS.accent=document.getElementById('setAccent').value;const ol=document.getElementById('setOled');if(ol)SETTINGS.oled=ol.value==='1';SETTINGS.voiceLang=document.getElementById('setVoice').value;const g=document.getElementById('setGender');if(g)SETTINGS.voiceGender=g.value;const snd=document.getElementById('setSounds');if(snd)SETTINGS.sounds=snd.value==='1';const vol=document.getElementById('setVolume');if(vol)SETTINGS.volume=parseFloat(vol.value)||0.5;SETTINGS.inputMethod=document.getElementById('setInput').value;SETTINGS.vibration=document.getElementById('setVib').value==='1';saveSettings();applyTheme();voiceLang=SETTINGS.voiceLang;try{pickVoice()}catch(e){}}
function clearSettings(){if(!confirm('Réinitialiser tous les réglages ?'))return;try{localStorage.removeItem(SETTINGS_KEY)}catch(e){}SETTINGS={theme:'dark',accent:'orange',voiceLang:'en',voiceGender:'female',sounds:true,volume:0.5,inputMethod:'pad',vibration:true,oled:true,botAvg:BOT_DEFAULT};persistSettings();openSettings();showToast('Réglages réinitialisés','success')}
