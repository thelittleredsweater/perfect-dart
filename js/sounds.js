'use strict';
const SOUNDS={start:'sounds/round-1-fight_G_minor.wav',big:'sounds/impressive_A_minor.wav',perfect:'sounds/excellent_G_major.wav',checkout:'sounds/finish-him.wav',win:'sounds/flawless-victory_C_major.wav'};
function soundPath(name){return SOUNDS[name]||null}
const soundCache={};
function playSound(name){if(typeof SETTINGS!=='undefined'&&SETTINGS.sounds===false)return;const src=soundPath(name);if(!src)return;if(typeof voiceEnqueue==='function'){voiceEnqueue({run:done=>playFile(src,done,'fx')});return}try{const a=new Audio(src);a.volume=(typeof SETTINGS!=='undefined'&&SETTINGS.volume!=null)?SETTINGS.volume:0.5;const p=a.play();if(p&&p.catch)p.catch(()=>{})}catch(e){}}
function playEvent(kind,winnerName){playSound(kind);if(window.NET&&NET.mode==='host'&&(NET.started||NET.tv))netSend({t:'event',kind,winnerName})}
function netAnnounce(total,remaining){if(window.NET&&NET.mode==='host'&&(NET.started||NET.tv))netSend({t:'event',kind:'score',total,remaining})}
