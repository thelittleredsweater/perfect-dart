'use strict';
document.addEventListener('DOMContentLoaded',()=>{
try{
loadSettings();applyTheme();initVoice();
PLAYER_COUNT=Math.min(6,Math.max(1,SETTINGS.playerCount||2));
updatePlayerInputs();updateResumeBtn();buildDartboard();
voiceLang=SETTINGS.voiceLang;
const cfgVoice=document.getElementById('cfgVoice');if(cfgVoice)cfgVoice.value=SETTINGS.voiceLang;
document.getElementById('cfgMode').addEventListener('change',applyModeFieldVisibility);
['cfgFinish','cfgDoubleIn','cfgCutThroat','cfgAround'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',updateRulesBox)});
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
document.getElementById('setSounds')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setVolume')?.addEventListener('change',e=>{persistSettings()});
document.getElementById('setInput')?.addEventListener('change',e=>{persistSettings();setInputMethod(SETTINGS.inputMethod)});
document.getElementById('setVib')?.addEventListener('change',e=>{persistSettings()});
applyModeFieldVisibility();
updateMuteBtn();
/* Lien d'invitation (QR hote) : /index.html?join=CODE -> pre-remplir le code et rejoindre. */
try{
  const jc=new URLSearchParams(location.search).get('join');
  if(jc&&jc.trim().length===6&&typeof openNetPanel==='function'){openNetPanel();const ce=document.getElementById('netCode');if(ce)ce.value=jc.trim().toUpperCase();netJoin()}
}catch(e){}
window.addEventListener('beforeunload',()=>{try{if(typeof savePlayerNames==='function')savePlayerNames()}catch(e){}if(!STATE.gameOver&&STATE.players.length>0)saveGame()});
}catch(e){try{showToast('Erreur au demarrage : '+e.message,'error')}catch(_){alert('Erreur au demarrage : '+e.message)}}
});
window.addEventListener('error',e=>{try{if(!STATE.players.length)return;showToast('Erreur : '+e.message,'error')}catch(_){}});