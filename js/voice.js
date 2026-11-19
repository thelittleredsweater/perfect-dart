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
function remoteSpeak(text,cb){const fin=typeof cb==='function'?cb:()=>{};if(voiceLang==='off'||typeof Audio==='undefined'){fin();return}if(Date.now()<remoteBlockedUntil){fin();return}stopRemote();const seq=++remoteSeq;const key=voiceLang+':'+text;const start=u=>{if(seq!==remoteSeq||voiceLang==='off'){fin();return}stopRemote();remoteAudio=u;lastAudio=u;u.onended=fin;u.onerror=()=>{remoteBlockedUntil=Date.now()+REMOTE_BLOCK_MS;fin()};const p=u.play();if(p&&p.catch)p.catch(fin)};const cached=remoteCache[key];if(cached){start(new Audio(cached));return}const url=REMOTE_BASE+'?ie=UTF-8&client=tw-ob&ttsspeed=1&tl='+(voiceLang==='fr'?'fr':'en-GB'.slice(0,2))+'&q='+encodeURIComponent(text);let launched=false;const direct=()=>{if(launched)return;launched=true;try{start(new Audio(url))}catch(e){fin()}};if(typeof fetch==='function'){let to=null;const timeout=new Promise((_,rej)=>{to=setTimeout(()=>rej(new Error('timeout')),REMOTE_TIMEOUT_MS)});Promise.race([fetch(url,{mode:'cors'}),timeout]).then(r=>{clearTimeout(to);if(!r.ok)throw new Error('http '+r.status);return r.blob()}).then(b=>{clearTimeout(to);let src=url;try{src=URL.createObjectURL(b)}catch(e){}remoteCache[key]=src;if(seq===remoteSeq)start(new Audio(src));else fin()}).catch(()=>{clearTimeout(to);direct()})}else direct()}
function pickVoice(){if(!voiceSynth)return;let voices=[];try{voices=voiceSynth.getVoices()||[]}catch(e){}if(!voices.length)return;const male=typeof SETTINGS!=='undefined'&&SETTINGS.voiceGender==='male';const lang=voiceLang==='fr'?'fr':'en';const pref=voiceLang==='fr'?(male?MALE_FR:FEMALE_FR):(male?MALE_EN:FEMALE_EN);const pool=voices.filter(v=>v.lang&&v.lang.toLowerCase().startsWith(lang));const all=pool.length?pool:voices;let best=null,bestScore=-1;all.forEach(v=>{const n=(v.name||'').toLowerCase();let s=0;if(pref.some(p=>p&&n.includes(p)))s+=5;if(n.includes('natural'))s+=4;if(n.includes('online'))s+=1;if(n.includes('female'))s+=male?-4:2;if(n.includes('male')&&!n.includes('female'))s+=male?2:-4;if(pool.length)s+=2;if(s>bestScore){bestScore=s;best=v}});voiceObj=best||all[0];voiceReady=true}
/* ================== File d'attente vocale ==================
   Chaque annonce (son embarqué, synthèse locale, relais distant, effet sonore)
   attend la fin de la précédente (audio 'ended' / utterance 'end'). Une annonce
   prioritaire (bust, checkout) vide la file et coupe celle en cours. Un garde-fou
   temporel débloque la file si un 'ended' n'arrive jamais. */
const VOICE_MAX_MS=7000;
let voiceQueue=[],voiceBusy=false,voiceTok=0,voiceCurrent=null,voiceGuard=null;
function voiceEnqueue(item,priority){if(priority)voiceFlush();voiceQueue.push(item);voiceNext()}
function voiceFlush(){voiceQueue=[];voiceTok++;voiceBusy=false;clearTimeout(voiceGuard);if(voiceCurrent){try{voiceCurrent.pause()}catch(e){}voiceCurrent=null}try{if(voiceSynth&&(voiceSynth.speaking||voiceSynth.pending))voiceSynth.cancel()}catch(e){}stopRemote()}
function voiceNext(){if(voiceBusy||!voiceQueue.length)return;const item=voiceQueue.shift();voiceBusy=true;const tok=++voiceTok;let finished=false;const done=()=>{if(finished||tok!==voiceTok)return;finished=true;clearTimeout(voiceGuard);voiceCurrent=null;voiceBusy=false;voiceNext()};done.live=()=>!finished&&tok===voiceTok;voiceGuard=setTimeout(done,item.maxMs||VOICE_MAX_MS);try{item.run(done)}catch(e){done()}}
/* Lecture d'un élément audio dans la file (réutilisable : effets sonores en cache). */
function voicePlayAudio(a,done){if(!a){done();return}voiceCurrent=a;a.onended=done;a.onerror=done;try{a.currentTime=0}catch(e){}const p=a.play();if(p&&p.catch)p.catch(done)}
/* speak(text, interrupt) : mise en file ; interrupt=true = annonce prioritaire
   (vide la file). Si la synthese locale n'a aucune voix (webview Android vierge),
   bascule automatiquement sur le relais. */
function speak(text,interrupt){if(voiceLang==='off'||!text)return;voiceEnqueue({run:done=>speakNow(text,done),maxMs:Math.max(VOICE_MAX_MS,String(text).length*110)},!!interrupt)}
function speakNow(text,done){if(voiceLang==='off'){done();return}if(!localVoicesReady()){remoteSpeak(text,done);return}try{if(voiceSynth.speaking||voiceSynth.pending)voiceSynth.cancel();if(voiceSynth.paused)voiceSynth.resume();const want=voiceLang==='fr'?'fr':'en';if(!voiceReady||!voiceObj||!voiceObj.lang||voiceObj.lang.slice(0,2).toLowerCase()!==want)pickVoice();const u=new SpeechSynthesisUtterance(text);u.lang=voiceLang==='fr'?'fr-FR':'en-GB';if(voiceObj&&voiceObj.lang&&voiceObj.lang.slice(0,2).toLowerCase()===want)u.voice=voiceObj;u.rate=voiceLang==='en'?.9:.98;u.pitch=voiceLang==='en'?.95:1.02;u.onend=done;u.onerror=()=>{if(done.live&&!done.live())return;try{voiceSynth.cancel()}catch(e){}remoteSpeak(text,done)};// contournement Chromium : speak juste apres cancel est ignore
setTimeout(()=>{if(done.live&&!done.live())return;try{voiceSynth.speak(u)}catch(e){done()}},60)}catch(e){remoteSpeak(text,done)}}
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
function playBundled(path,spoken,priority){if(typeof Audio==='undefined'){if(spoken)speak(spoken,priority);return}voiceEnqueue({run:done=>{if(voiceLang==='off'){done();return}let a=null;try{a=new Audio(path);a.preload='auto'}catch(e){}voicePlayAudio(a,done)}},!!priority)}
/* Dictée d'une flechette : "Triple 20", "Double 16", "Bull", "Manqué"… */
function dartSpeech(d){if(!d)return'';if(voiceLang==='en'){if(d.value===0)return'Miss';if(d.baseValue===25)return d.mult===2?'Double bull':'Bull';if(d.mult===3)return'Triple '+d.baseValue;if(d.mult===2)return'Double '+d.baseValue;return String(d.baseValue)}if(d.value===0)return'Manqué';if(d.baseValue===25)return d.mult===2?'Double bull':'Bull';if(d.mult===3)return'Triple '+d.baseValue;if(d.mult===2)return'Double '+d.baseValue;return String(d.baseValue)}
function announceDart(dart){if(!voiceActive()||!dart)return;const f=dartAudioFile(dart);if(f){playBundled(f,dartSpeech(dart));return}speak(dartSpeech(dart))}
function announceCheckout(){if(!voiceActive())return;if(voiceLang==='en')speak('Game shot!',true);else playBundled(VOICE_AUDIO_BASE+'jeu.wav',null,true)}
function announceBust(){if(!voiceActive())return;if(voiceLang==='en')speak('No score',true);else playBundled(VOICE_AUDIO_BASE+'rien.wav',null,true)}
function stopVoice(){voiceFlush()}
