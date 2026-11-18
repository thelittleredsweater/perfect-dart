'use strict';
let voiceSynth=null,voiceEnabled=false,voiceLang='en',voiceObj=null,voiceReady=false,voiceUnlocked=false;
let remoteCache={},remoteAudio=null,remoteSeq=0,remoteBlockedUntil=0,lastAudio=null;
const REMOTE_BLOCK_MS=30000,REMOTE_TIMEOUT_MS=2500;
/* Relais TTS : StreamElements (kappa/v2/speech) repond 401 depuis fin 2025 -> Google TTS. */
const REMOTE_BASE='https://translate.google.com/translate_tts';
const FEMALE_FR=['denise','charline','amelie','amélie','audrey','julie','virginie','celine','céline','marie','lorette','hortense','google français'];
const FEMALE_EN=['serena','sonia','libby','aria','jenny','emma','kate','samantha','karen','moira','tessa','fiona','hazel','susan','zira','google uk english female','google us english'];
const MALE_FR=['claude','paul','henri','jerome','rémy','remy','nicolas','thomas','pierre','antoine'];
const MALE_EN=['george','guy','ryan','davis','david','mark','eric','alex','daniel','oliver','brian','russell','rishi','google uk english male'];
function initVoice(){if(!('speechSynthesis'in window)){voiceObj=null;return}voiceSynth=window.speechSynthesis;voiceEnabled=true;pickVoice();try{voiceSynth.onvoiceschanged=()=>pickVoice()}catch(e){}// Android : les voix arrivent en differe, on re-poll sans se fier a onvoiceschanged
setTimeout(pickVoice,800);setTimeout(pickVoice,2500);
// iOS/Safari : la synthese exige un premier geste utilisateur — on la debloque au premier tap (utterance muette).
try{document.addEventListener('pointerdown',()=>{if(voiceUnlocked||!voiceSynth)return;voiceUnlocked=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;voiceSynth.speak(u)}catch(e){}},true)}catch(e){}}
function voiceStatus(){if(!('speechSynthesis'in window))return'no-api';let n=0;try{n=(window.speechSynthesis.getVoices()||[]).length}catch(e){}return n?'ok':'no-voice'}
function voiceActive(){if(voiceLang==='off')return false;if(voiceEnabled)return true;return typeof Audio!=='undefined'}
function localVoicesReady(){if(!voiceSynth)return false;try{if(typeof voiceSynth.getVoices!=='function')return typeof voiceSynth.speak==='function';return((voiceSynth.getVoices()||[]).length>0)}catch(e){return false}}
function stopRemote(){if(remoteAudio){try{remoteAudio.pause()}catch(e){}remoteAudio=null}}
function remoteSpeak(text){if(voiceLang==='off'||typeof Audio==='undefined')return;if(Date.now()<remoteBlockedUntil)return;stopRemote();const seq=++remoteSeq;const key=voiceLang+':'+text;const start=u=>{if(seq!==remoteSeq||voiceLang==='off')return;stopRemote();remoteAudio=u;lastAudio=u;u.onerror=()=>{remoteBlockedUntil=Date.now()+REMOTE_BLOCK_MS};const p=u.play();if(p&&p.catch)p.catch(()=>{})};const cached=remoteCache[key];if(cached){start(new Audio(cached));return}const url=REMOTE_BASE+'?ie=UTF-8&client=tw-ob&ttsspeed=1&tl='+(voiceLang==='fr'?'fr':'en-GB'.slice(0,2))+'&q='+encodeURIComponent(text);let launched=false;const direct=()=>{if(launched)return;launched=true;try{const a=new Audio(url);a.onerror=()=>{remoteBlockedUntil=Date.now()+REMOTE_BLOCK_MS};start(a)}catch(e){}};if(typeof fetch==='function'){let to=null;const timeout=new Promise((_,rej)=>{to=setTimeout(()=>rej(new Error('timeout')),REMOTE_TIMEOUT_MS)});Promise.race([fetch(url,{mode:'cors'}),timeout]).then(r=>{clearTimeout(to);if(!r.ok)throw new Error('http '+r.status);return r.blob()}).then(b=>{clearTimeout(to);let src=url;try{src=URL.createObjectURL(b)}catch(e){}remoteCache[key]=src;if(seq===remoteSeq)start(new Audio(src))}).catch(()=>{clearTimeout(to);direct()})}else direct()}
function pickVoice(){if(!voiceSynth)return;let voices=[];try{voices=voiceSynth.getVoices()||[]}catch(e){}if(!voices.length)return;const male=typeof SETTINGS!=='undefined'&&SETTINGS.voiceGender==='male';const lang=voiceLang==='fr'?'fr':'en';const pref=voiceLang==='fr'?(male?MALE_FR:FEMALE_FR):(male?MALE_EN:FEMALE_EN);const pool=voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith(lang));const all=pool.length?pool:voices;let best=null,bestScore=-1;all.forEach(v=>{const n=(v.name||'').toLowerCase();let s=0;if(pref.some(p=>p&&n.includes(p)))s+=5;if(n.includes('natural'))s+=4;if(n.includes('online'))s+=1;if(n.includes('female'))s+=male?-4:2;if(n.includes('male')&&!n.includes('female'))s+=male?2:-4;if(pool.length)s+=2;if(s>bestScore){bestScore=s;best=v}});voiceObj=best||all[0];voiceReady=true}
/* speak(text, interrupt) : interrupt=true annule la parole en cours (annonces de volée),
   sinon mise en file (dictée fléchette par fléchette). Si la synthese locale n'a
   aucune voix (webview Android vierge), bascule automatiquement sur le relais. */
function speak(text,interrupt){if(voiceLang==='off'||!text)return;if(!localVoicesReady()){remoteSpeak(text);return}try{if(interrupt&&(voiceSynth.speaking||voiceSynth.pending))voiceSynth.cancel();if(voiceSynth.paused)voiceSynth.resume();const want=voiceLang==='fr'?'fr':'en';if(!voiceReady||!voiceObj||!voiceObj.lang||voiceObj.lang.slice(0,2).toLowerCase()!==want)pickVoice();const u=new SpeechSynthesisUtterance(text);u.lang=voiceLang==='fr'?'fr-FR':'en-GB';if(voiceObj&&voiceObj.lang&&voiceObj.lang.slice(0,2).toLowerCase()===want)u.voice=voiceObj;u.rate=voiceLang==='en'?.9:.98;u.pitch=voiceLang==='en'?.95:1.02;u.onerror=()=>{try{voiceSynth.cancel()}catch(e){}remoteSpeak(text)};// contournement Chromium : speak juste apres cancel est ignore
setTimeout(()=>{try{voiceSynth.speak(u)}catch(e){}},60)}catch(e){remoteSpeak(text)}}
/* ================== Audio embarque (dictie flechette par flechette) ==================
   La WebView Android n'a aucune voix TTS : on embarque les appels en francais
   (sounds/voice/fr, voix generee). Lecture directe a chaque flechette ; repli
   speechSynthesis, puis relais distant. */
const VOICE_AUDIO_BASE='sounds/voice/fr/';
function dartAudioFile(d){
  if(voiceLang!=='fr'||!d)return null;
  if(d.value===0)return VOICE_AUDIO_BASE+'manque.wav';
  if(d.baseValue===25)return d.mult===2?VOICE_AUDIO_BASE+'double-bull.wav':VOICE_AUDIO_BASE+'bull.wav';
  const b=d.baseValue;
  if(!b||b<1||b>20)return null;
  if(d.mult===3)return VOICE_AUDIO_BASE+'t'+b+'.wav';
  if(d.mult===2)return VOICE_AUDIO_BASE+'d'+b+'.wav';
  return VOICE_AUDIO_BASE+'n'+b+'.wav';
}
function playBundled(path,spoken){if(typeof Audio==='undefined'){if(spoken)speak(spoken);return}try{const a=new Audio(path);a.preload='auto';const p=a.play();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
/* Dictée d'une flechette : "Triple 20", "Double 16", "Bull", "Manqué"… */
function dartSpeech(d){if(!d)return'';if(voiceLang==='en'){if(d.value===0)return'Miss';if(d.baseValue===25)return d.mult===2?'Double bull':'Bull';if(d.mult===3)return'Triple '+d.baseValue;if(d.mult===2)return'Double '+d.baseValue;return String(d.baseValue)}if(d.value===0)return'Manqué';if(d.baseValue===25)return d.mult===2?'Double bull':'Bull';if(d.mult===3)return'Triple '+d.baseValue;if(d.mult===2)return'Double '+d.baseValue;return String(d.baseValue)}
function announceDart(dart){if(!voiceActive()||!dart)return;const f=dartAudioFile(dart);if(f){playBundled(f,dartSpeech(dart));return}speak(dartSpeech(dart))}
function announceCheckout(){if(!voiceActive())return;if(voiceLang==='en')speak('Game shot!',true);else playBundled(VOICE_AUDIO_BASE+'jeu.wav')}
function announceBust(){if(!voiceActive())return;if(voiceLang==='en')speak('No score',true);else playBundled(VOICE_AUDIO_BASE+'rien.wav')}
function stopVoice(){try{if(voiceSynth)voiceSynth.cancel()}catch(e){}stopRemote()}
