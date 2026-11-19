'use strict';
const SOUNDS={start:'sounds/round-1-fight_G_minor.wav',big:'sounds/impressive_A_minor.wav',perfect:'sounds/excellent_G_major.wav',checkout:'sounds/finish-him.wav',win:'sounds/flawless-victory_C_major.wav'};
const soundCache={};
function playSound(name){if(typeof SETTINGS!=='undefined'&&SETTINGS.sounds===false)return;const src=SOUNDS[name];if(!src)return;try{let a=soundCache[name];if(!a){a=new Audio(src);a.preload='auto';soundCache[name]=a}a.volume=(typeof SETTINGS!=='undefined'&&SETTINGS.volume!=null)?SETTINGS.volume:0.5;if(typeof voiceEnqueue==='function'){voiceEnqueue({run:done=>voicePlayAudio(a,done)});return}try{a.currentTime=0}catch(e){}const p=a.play();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function playEvent(kind,winnerName){playSound(kind);if(window.NET&&NET.mode==='host'&&NET.started)netSend({t:'event',kind,winnerName})}
function netAnnounce(total,remaining){if(window.NET&&NET.mode==='host'&&NET.started)netSend({t:'event',kind:'score',total,remaining})}
// Prechargement au demarrage : evite le temps de chargement du premier son joue.
if(typeof Audio!=='undefined'){Object.keys(SOUNDS).forEach(k=>{try{const a=new Audio(SOUNDS[k]);a.preload='auto';soundCache[k]=a;a.load()}catch(e){}})}
