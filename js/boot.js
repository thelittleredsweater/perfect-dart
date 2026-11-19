'use strict';
document.addEventListener('DOMContentLoaded',()=>{
setTimeout(()=>{try{if(typeof initUpdates==='function')initUpdates()}catch(e){}},0);
try{
loadSettings();applyTheme();initVoice();
PLAYER_COUNT=Math.min(6,Math.max(1,SETTINGS.playerCount||2));
updatePlayerInputs();updateResumeBtn();buildDartboard();
voiceLang=SETTINGS.voiceLang;
const cfgVoice=document.getElementById('cfgVoice');if(cfgVoice)cfgVoice.value=SETTINGS.voiceLang;
document.getElementById('cfgMode').addEventListener('change',applyModeFieldVisibility);
document.getElementById('cfgOpponent')?.addEventListener('change',applyModeFieldVisibility);
['cfgFinish','cfgDoubleIn','cfgCutThroat','cfgAround','cfgLegs','cfgSets'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',updateRulesBox)});
const botRange=document.getElementById('cfgBotLevel');
if(botRange){
  botRange.value=String(clampBotAvg(SETTINGS.botAvg));
  const syncBotLabel=()=>{const v=clampBotAvg(botRange.value);document.getElementById('botAvgLabel').textContent=v;SETTINGS.botAvg=v};
  syncBotLabel();
  botRange.addEventListener('input',()=>{syncBotLabel();saveSettings()});
}
document.getElementById('cfgVoice')?.addEventListener('change',e=>{SETTINGS.voiceLang=e.target.value;saveSettings();voiceLang=e.target.value});
document.getElementById('btnPad')?.addEventListener('click',()=>setInputMethod('pad'));
document.getElementById('btnBoard')?.addEventListener('click',()=>setInputMethod('board'));
document.getElementById('setAccent')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setTheme')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setOled')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setVoice')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setGender')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setCaller')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setCoach')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setSounds')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setVolume')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setInput')?.addEventListener('change',e=>{persistSettings();setInputMethod(SETTINGS.inputMethod)});
document.getElementById('setVib')?.addEventListener('change',e=>{persistSettings()});
applyModeFieldVisibility();
updateMuteBtn();
initBackButton();
initPickers();
/* Lien d'invitation (QR hote) : /index.html?join=CODE -> pre-remplir le code et rejoindre.
   Redirection APK depuis la page appassets : ?create=1 -> cree une partie hote directement.
   Ces parametres portent l'action a travers le changement d'origine (l'adresse du
   serveur est location.host ici, plus besoin du champ saisie). */
try{
  const qs=new URLSearchParams(location.search);
  const tvc=qs.get('tv');
  if(tvc&&tvc.trim().length===6){tvWatch(tvc.trim().toUpperCase())}
  else if(qs.get('tvhost')==='1'&&typeof openNetPanel==='function'){openNetPanel();tvHost()}
  const jc=tvc?null:qs.get('join');
  if(jc&&jc.trim().length===6&&typeof openNetPanel==='function'){openNetPanel();const ce=document.getElementById('netCode');if(ce)ce.value=jc.trim().toUpperCase();const ne=document.getElementById('netName');const nm=qs.get('name');if(ne&&nm&&!ne.value)ne.value=nm;netJoin()}
  else if(qs.get('create')==='1'&&typeof openNetPanel==='function'){openNetPanel();netHost()}
}catch(e){}
window.addEventListener('beforeunload',()=>{try{if(typeof savePlayerNames==='function')savePlayerNames()}catch(e){}if(!STATE.gameOver&&STATE.players.length>0)saveGame()});
}catch(e){try{showToast('Erreur au demarrage : '+e.message,'error')}catch(_){alert('Erreur au demarrage : '+e.message)}}
});
window.addEventListener('error',e=>{try{if(!STATE.players.length)return;showToast('Erreur : '+e.message,'error')}catch(_){}});