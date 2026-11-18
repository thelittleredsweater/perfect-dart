'use strict';
/* Mode en ligne (reseau local) : l'hote crée un salon, les joueurs rejoignent par code/QR.
   L'hote detentionne l'etat ; chaque joueur distant saisit ses fléchettes depuis son téléphone.
   Necessite : node server.js  puis ouvrir http://IP-du-PC:3210/ sur tous les appareils. */
var NET={mode:null,ws:null,code:'',seat:0,roster:[],started:false,overlayCb:null};
const SERVER_KEY='perfectdarts_server_v1';
function netUrl(){if(location.host)return(location.protocol==='https:'?'wss://':'ws://')+location.host;let s='';try{const el=document.getElementById('netServerAddr');s=(el&&el.value?el.value:'')||localStorage.getItem(SERVER_KEY)||''}catch(e){s=netServerSaved()}const a=String(s).trim().replace(/^wss?:\/\//i,'').replace(/\/+$/,'');return a?'ws://'+a:''}
function netServerSaved(){try{return localStorage.getItem(SERVER_KEY)||''}catch(e){return''}}
function saveServerAddr(){try{const el=document.getElementById('netServerAddr');if(el&&el.value.trim())localStorage.setItem(SERVER_KEY,el.value.trim().replace(/^wss?:\/\//i,'').replace(/\/+$/,''))}catch(e){}}
function netConnect(onOpen,onMsg,onClose){const url=netUrl();if(!url){showToast('Renseigne l\u2019adresse du serveur (ex. 192.168.1.20:3210)','error');return false}try{const ws=new WebSocket(url);NET.ws=ws;ws.onopen=()=>onOpen&&onOpen();ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}onMsg&&onMsg(m)};ws.onclose=()=>{onClose&&onClose()};return true}catch(e){showToast('Connexion impossible : '+e.message,'error');return false}}
function netSend(o){if(NET.ws&&NET.ws.readyState===1){try{NET.ws.send(JSON.stringify(o))}catch(e){}}}
function openNetPanel(){NET.roster=[];NET.mode=null;NET.started=false;const ov=document.getElementById('netOverlay');if(!ov)return;ov.classList.add('show');document.getElementById('netHome').style.display='';document.getElementById('netLobby').style.display='none';document.getElementById('netJoinErr').textContent='';const sf=document.getElementById('netServerField');if(sf)sf.style.display=location.host?'none':'';const sa=document.getElementById('netServerAddr');if(sa&&!sa.value)sa.value=netServerSaved()}
function closeNetPanel(){const ov=document.getElementById('netOverlay');if(ov)ov.classList.remove('show');if(NET.ws){try{NET.ws.close()}catch(e){}}NET.ws=null;NET.mode=null}
function netHidePanel(){const ov=document.getElementById('netOverlay');if(ov)ov.classList.remove('show');document.getElementById('netHome').style.display='none';document.getElementById('netLobby').style.display='none'}
function netHost(){saveServerAddr();netConnect(()=>{netSend({t:'create'})},m=>{
  if(m.t==='created'){NET.mode='host';NET.code=m.code;document.getElementById('netHome').style.display='none';document.getElementById('netLobby').style.display='';document.getElementById('netRoomCode').textContent=m.code;const origin=location.host?'':'http://'+String(netServerSaved()||'').replace(/^wss?:\/\//i,'');document.getElementById('netQr').src=origin+'/qr?u='+encodeURIComponent((m.joinUrl||'')+'?join='+m.code);netLobbyList(1);NET.joinUrl=m.joinUrl}
  else if(m.t==='player-joined'){NET.roster.push({seat:m.seat,name:m.name});netLobbyList(m.count);showToast(m.name+' a rejoint la partie','success')}
  else if(m.t==='player-left'){NET.roster=NET.roster.filter(r=>r.seat!==m.seat);netLobbyList(m.count)}
  else if(m.t==='dart'&&NET.started){if(STATE.currentPlayer===m.seat&&!STATE.gameOver)throwDart(m.value,m.mult)}
  else if(m.t==='quick'&&NET.started){if(STATE.currentPlayer===m.seat&&!STATE.gameOver)quickScore(m.value)}
  else if(m.t==='pass'&&NET.started){if(STATE.currentPlayer===m.seat&&!STATE.gameOver)skipTurn()}
  else if(m.t==='undo'&&NET.started){undoLast()}
},()=>{if(NET.mode==='host'&&!NET.started){showToast('Serveur déconnecté','error');closeNetPanel()}})}
function netLobbyList(count){const el=document.getElementById('netPlayers');if(!el)return;const host=(document.getElementById('playerName1')||{}).value||'Hôte';let h='<div class="net-p">👤 '+escapeHtml(host)+' (cet appareil)</div>';NET.roster.forEach(r=>{h+='<div class="net-p">📱 '+escapeHtml(r.name||'Joueur '+(r.seat+1))+'</div>'});el.innerHTML=h;const b=document.getElementById('netLaunchBtn');if(b)b.textContent='🚀 Lancer la partie ('+((NET.roster||[]).length+1)+' joueurs)'}
function netLaunch(){if(!NET.roster.length){showToast('En attente des autres joueurs…','error');return}NET.started=true;netSend({t:'start'});netHidePanel();STATE.online=true;startGame()}
function netJoin(){saveServerAddr();const code=(document.getElementById('netCode').value||'').trim().toUpperCase();const name=(document.getElementById('netName').value||'').trim()||'Joueur';if(code.length!==6){document.getElementById('netJoinErr').textContent='Code à 6 caractères';return}netConnect(()=>{netSend({t:'join',code,name})},m=>{
  if(m.t==='joined'){NET.mode='client';NET.seat=m.seat;document.getElementById('netHome').style.display='none';document.getElementById('netLobby').style.display='';document.getElementById('netRoomCode').textContent=code;document.getElementById('netQr').src='img/hero-dartboard.jpg';document.getElementById('netWait').textContent='En attente du lancement par l\'hôte…';document.getElementById('netPlayers').innerHTML='';document.getElementById('netLaunchBtn').style.display='none'}
  else if(m.t==='started'){NET.started=true;netHidePanel();showScreen('screenGame');NET.gate()}
  else if(m.t==='state'){NET.applyState(m.s)}
  else if(m.t==='event'){playSound(m.kind==='big'?'big':m.kind);if(m.kind==='score'&&typeof announceScore==='function'&&m.total!=null)announceScore(m.total,m.remaining);if(m.kind==='win'&&m.name)netShowWinner(m.name)}
  else if(m.t==='host-gone'){showToast('L\'hôte a quitté la partie','error');closeNetPanel();showScreen('screenSetup')}
  else if(m.t==='err'){document.getElementById('netJoinErr').textContent=m.msg||'Erreur';try{NET.ws.close()}catch(e){}}
},()=>{if(NET.mode==='client'){showToast('Connexion perdue avec l\'hôte','error');closeNetPanel();showScreen('screenSetup')}})}
function netShowWinner(name){const el=document.getElementById('winnerName');if(el)el.textContent=name+' a gagné !';const ov=document.getElementById('winnerOverlay');if(ov)ov.classList.add('active');const st=document.getElementById('winnerStats');if(st)st.innerHTML='';if(typeof playSound==='function')playSound('win')}
NET.onRender=function(){if(NET.mode==='host'&&NET.started)NET.syncState();else if(NET.mode==='client')NET.gate()};
NET.syncState=function(){if(!NET.started)return;const st={mode:STATE.mode,finishDouble:STATE.finishDouble,currentPlayer:STATE.currentPlayer,dartsThisTurn:STATE.dartsThisTurn,turnCount:STATE.turnCount,gameOver:STATE.gameOver,cricketMarks:STATE.cricketMarks,aroundClock:STATE.aroundClock,log:(STATE.log||[]).slice(0,12),players:STATE.players.map(p=>({name:p.name,score:p.score,turns:p.turns,totalScored:p.totalScored,dartsThrown:p.dartsThrown,bestTurn:p.bestTurn,isBot:!!p.isBot}))};netSend({t:'state',s:st})};
NET.applyState=function(s){if(!s)return;STATE.players=s.players||[];STATE.currentPlayer=s.currentPlayer;STATE.dartsThisTurn=s.dartsThisTurn||[];STATE.turnCount=s.turnCount;STATE.gameOver=s.gameOver;STATE.cricketMarks=s.cricketMarks||{};STATE.aroundClock=s.aroundClock||{};STATE.log=s.log||[];STATE.mode=s.mode;STATE.finishDouble=s.finishDouble;renderAll()};
NET.gate=function(){const my=(NET.mode==='client'&&NET.started)?STATE.currentPlayer===NET.seat&&!STATE.gameOver:(NET.mode==='host');['boardGrid','quickScores','padContainer','multiplier-bar','board-toggle'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.toggle('net-locked',NET.mode==='client'&&!my)});const mk=document.querySelector('.multiplier-bar');if(mk)mk.classList.toggle('net-locked',NET.mode==='client'&&!my)};
NET.sendDart=function(v,mult){netSend({t:'dart',value:v,mult:(mult!=null?mult:STATE.currentMult)})};
NET.sendQuick=function(v){netSend({t:'quick',value:v})};
