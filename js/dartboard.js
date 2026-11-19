'use strict';
const SECTORS=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
function ringSector(cx,cy,r1,r2,a1,a2){const toRad=d=>d*Math.PI/180;const pt=(r,a)=>`${(cx+r*Math.cos(toRad(a))).toFixed(2)},${(cy+r*Math.sin(toRad(a))).toFixed(2)}`;const large=(a2-a1)>180?1:0;return `M ${pt(r2,a1)} A ${r2} ${r2} 0 ${large} 1 ${pt(r2,a2)} L ${pt(r1,a2)} A ${r1} ${r1} 0 ${large} 0 ${pt(r1,a1)} Z`}
function buildDartboard(){const svg=document.getElementById('dartboard');if(!svg||svg.dataset.built)return;const cx=350,cy=350;const R_INNER=22,R_BULL=55,R_T1=157,R_T2=200,R_D1=255,R_EDGE=312,R_TXT=331,R_CATCH=350;
const dark='#14161c',cream='#e8dfc6',red='#c73a34',green='#157a3f',wire='#cfd3dc',wireDark='rgba(10,12,18,.65)';
const parts=[];
// defs : vignettage profondite
parts.push(`<defs><radialGradient id="boardVign" cx="50%" cy="42%" r="65%"><stop offset="0%" stop-color="rgba(255,255,255,.10)"/><stop offset="55%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,.30)"/></radialGradient></defs>`);
// reception des clics jusqu'au bord (au fond : zones marquees au-dessus)
parts.push(`<circle cx="${cx}" cy="${cy}" r="${R_CATCH}" fill="transparent" data-base="0" data-mult="1"/>`);
// zone manquee peripherique (fond noir, comptabilise 0)
parts.push(`<circle cx="${cx}" cy="${cy}" r="${(R_EDGE+R_CATCH)/2}" fill="none" stroke="#0d0f16" stroke-width="${R_CATCH-R_EDGE}" data-base="0" data-mult="1"/>`);
// secteurs : simples noir/creme, doubles et triples rouge/vert alternes
const stroke='stroke="rgba(255,255,255,.06)" stroke-width="1"';
for(let i=0;i<20;i++){const a=-99+i*18,b=a+18,v=SECTORS[i];const fill=i%2?cream:dark;const ring=i%2?red:green;
parts.push(`<path d="${ringSector(cx,cy,R_BULL,R_T1,a,b)}" fill="${fill}" ${stroke} data-base="${v}" data-mult="1"/>`);
parts.push(`<path d="${ringSector(cx,cy,R_T1,R_T2,a,b)}" fill="${ring}" ${stroke} data-base="${v}" data-mult="3"/>`);
parts.push(`<path d="${ringSector(cx,cy,R_T2,R_D1,a,b)}" fill="${fill}" ${stroke} data-base="${v}" data-mult="1"/>`);
parts.push(`<path d="${ringSector(cx,cy,R_D1,R_EDGE,a,b)}" fill="${ring}" ${stroke} data-base="${v}" data-mult="2"/>`);}
// bull : anneau vert + oeil rouge
parts.push(`<circle cx="${cx}" cy="${cy}" r="${R_BULL}" fill="${green}" stroke="rgba(255,255,255,.1)" data-base="25" data-mult="1"/>`);
parts.push(`<circle cx="${cx}" cy="${cy}" r="${R_INNER}" fill="${red}" data-base="25" data-mult="2"/>`);
// araignee metalique : cercles et rayons, deux couches (ombre puis metal)
const circles=[R_INNER,R_BULL,R_T1,R_T2,R_D1,R_EDGE].map(r=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${wireDark}" stroke-width="5" pointer-events="none"/>`).join('');
const spokes=[];for(let i=0;i<20;i++){const ang=(-99+i*18)*Math.PI/180;const x1=cx+R_BULL*Math.cos(ang),y1=cy+R_BULL*Math.sin(ang),x2=cx+R_EDGE*Math.cos(ang),y2=cy+R_EDGE*Math.sin(ang);spokes.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${wireDark}" stroke-width="5" pointer-events="none"/>`)}
const circlesL=circles.replace(/stroke-width="5"/g,'stroke-width="2.5"').replace(/stroke="[^"]*"/g,`stroke="${wire}"`);
const spokesL=spokes.join('').replace(/stroke-width="5"/g,'stroke-width="2.5"').replace(/stroke="[^"]*"/g,`stroke="${wire}"`);
parts.push(circles+spokes.join('')+circlesL+spokesL);
// vignettage au-dessus, sans interception des clics
parts.push(`<circle cx="${cx}" cy="${cy}" r="${R_CATCH}" fill="url(#boardVign)" pointer-events="none"/>`);
// numeros
for(let i=0;i<20;i++){const t=(-90+i*18)*Math.PI/180;const tx=cx+R_TXT*Math.cos(t),ty=cy+R_TXT*Math.sin(t);parts.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}">${SECTORS[i]}</text>`)}
svg.innerHTML=parts.join('');svg.dataset.built='1';
svg.addEventListener('click',e=>{const tgt=e.target.closest('[data-base]');if(!tgt)return;throwDart(parseInt(tgt.getAttribute('data-base'),10),parseInt(tgt.getAttribute('data-mult'),10))});
}
function setInputMethod(method){SETTINGS.inputMethod=method;saveSettings();const pad=document.getElementById('padContainer'),board=document.getElementById('boardContainer');const bp=document.getElementById('btnPad'),bb=document.getElementById('btnBoard');if(!pad||!board)return;if(method==='board'){buildDartboard();if(typeof renderCricketBoard==='function')renderCricketBoard();board.classList.remove('hidden');pad.classList.add('hidden');if(bb)bb.classList.add('selected');if(bp)bp.classList.remove('selected')}else{pad.classList.remove('hidden');board.classList.add('hidden');if(bp)bp.classList.add('selected');if(bb)bb.classList.remove('selected')}}
