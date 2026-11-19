'use strict';
/* ============================================================
   « 📺 Caster » : afficher la partie sur une TV.
   L'APK (Nitron) ne permet pas d'embarquer le kit Google Cast ni AirPlay :
   on passe par la recopie d'écran du système (Smart View, Caster l'écran,
   Recopie de l'écran sur iPhone, câble USB-C/HDMI). Une fois le téléphone
   tourné en paysage, l'écran de jeu passe en mise en page TV (css/app.css).
   L'écran reste allumé pendant la partie (Wake Lock) : indispensable en recopie.
   ============================================================ */
let castSheet=null;
function castPlatform(){const ua=(typeof navigator!=='undefined'&&navigator.userAgent)||'';if(/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&typeof navigator.maxTouchPoints==='number'&&navigator.maxTouchPoints>1))return'ios';if(/Android/i.test(ua))return'android';return'other'}
function castSteps(pf){
  if(pf==='ios')return[
    ['📱','Ouvre le <b>Centre de contrôle</b> (glisse depuis le coin en haut à droite).'],
    ['🖥️','Touche <b>Recopie de l\'écran</b> et choisis ton Apple TV ou ta TV AirPlay.'],
    ['🔄','<b>Tourne le téléphone</b> : l\'appli passe en affichage TV (scores en grand).']];
  if(pf==='android')return[
    ['📱','Glisse <b>deux fois depuis le haut</b> de l\'écran pour ouvrir les réglages rapides.'],
    ['📺','Touche <b>Smart View</b>, <b>Caster l\'écran</b> ou <b>Diffuser</b> (selon la marque) et choisis ta TV ou ton Chromecast.'],
    ['🔄','<b>Tourne le téléphone</b> : l\'appli passe en affichage TV (scores en grand).']];
  return[
    ['🖥️','Utilise la recopie d\'écran de ton appareil (Chromecast, Miracast, AirPlay) ou un câble HDMI.'],
    ['🔄','En paysage, l\'écran de jeu passe en affichage TV (scores en grand).']];
}
function openCast(){
  if(typeof document==='undefined'||!document.body||typeof document.body.querySelector!=='function')return;
  if(!castSheet){
    castSheet=document.createElement('div');castSheet.className='pick-sheet cast-sheet';castSheet.setAttribute('role','dialog');castSheet.setAttribute('aria-modal','true');
    castSheet.addEventListener('click',e=>{if(e.target===castSheet)closeCast()});
    document.body.appendChild(castSheet);
  }
  const pf=castPlatform();
  castSheet.innerHTML=`<div class="pick-panel cast-panel"><div class="pick-grab"></div>
    <div class="cast-title">📺 Afficher sur la TV</div>
    <ol class="cast-steps">${castSteps(pf).map((s,i)=>`<li><span class="cs-n">${i+1}</span><span class="cs-i">${s[0]}</span><span class="cs-t">${s[1]}</span></li>`).join('')}</ol>
    <div class="cast-note">💡 Pendant la partie, l'écran du téléphone reste allumé. Avec la recopie, l'arbitre et les sons passent en général sur la TV.</div>
    <div class="cast-actions">
      <button type="button" class="btn btn-primary" onclick="closeCast()">C'est parti</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="closeCast();openNetPanel()">Autre option : écran séparé via un PC</button>
    </div></div>`;
  requestAnimationFrame(()=>castSheet.classList.add('open'));
}
function closeCast(){if(!castSheet||!castSheet.classList.contains('open'))return false;castSheet.classList.remove('open');return true}

/* Écran toujours allumé pendant une partie. */
let wakeLock=null;
async function keepAwake(on){
  try{
    if(on){if(wakeLock||typeof navigator==='undefined'||!navigator.wakeLock)return;wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener&&wakeLock.addEventListener('release',()=>{wakeLock=null})}
    else if(wakeLock){const w=wakeLock;wakeLock=null;await w.release()}
  }catch(e){wakeLock=null}
}
/* Le verrou saute quand l'appli passe en arrière-plan : on le reprend au retour. */
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&typeof currentScreen!=='undefined'&&currentScreen==='screenGame')keepAwake(true)});
