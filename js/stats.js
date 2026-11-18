'use strict';
function loadCareer(){try{const raw=localStorage.getItem(CAREER_KEY);if(raw){const c=JSON.parse(raw);if(c&&c.profiles)return c}}catch(e){}return{profiles:{},history:[]}}
function saveCareer(c){try{localStorage.setItem(CAREER_KEY,JSON.stringify(c))}catch(e){}}
function profileNames(){return Object.keys(loadCareer().profiles).sort()}
function recordGameToCareer(winner,meta){const c=loadCareer();STATE.players.forEach((p,idx)=>{const name=p.name;const pr=c.profiles[name]=c.profiles[name]||{games:0,wins:0,scored:0,darts:0,bestTurn:0,c180:0,c140:0,c100:0,busts:0,dblHit:0,dblAtt:0,checkouts:0,f9sum:0,f9n:0,marks:0,rounds:0};pr.games++;if(p===winner)pr.wins++;pr.scored+=p.totalScored||0;pr.darts+=p.dartsThrown||0;pr.bestTurn=Math.max(pr.bestTurn,p.bestTurn||0);pr.c180+=p.count180||0;pr.c140+=p.count140||0;pr.c100+=p.count100||0;pr.busts+=p.busts||0;pr.dblHit+=p.doublesHit||0;pr.dblAtt+=p.doublesAttempted||0;pr.checkouts+=p.checkouts||0;
 /* First 9 : une contribution par partie jouee avec 9+ flechettes lancees. */
 if((p.dartsThrown||0)>=9){pr.f9sum+=(p.first9||0);pr.f9n++}
 /* MPR cricket : marques totales / tours. */
 if(STATE.mode==='cricket'&&STATE.cricketMarks&&STATE.cricketMarks[idx]){pr.marks+=Object.values(STATE.cricketMarks[idx]).reduce((s,v)=>s+Math.min(v,3),0);pr.rounds+=p.turns||0}
});
c.history.unshift({date:new Date().toISOString(),mode:STATE.mode,finishDouble:STATE.finishDouble,winner:winner.name,durationSec:meta.duration,players:STATE.players.map(p=>({name:p.name,score:p.score,isBot:p.isBot}))});if(c.history.length>40)c.history.length=40;saveCareer(c)}
function avg3(p){return p.darts?Math.round(3*p.scored/p.darts):0}
function dblPct(p){return p.dblAtt?Math.round(100*p.dblHit/p.dblAtt):0}
/* First 9 moyen (par volée de 3) et MPR moyens sur la carrière. */
function f9AvgOf(p){return p&&p.f9n?Math.round(10*p.f9sum/(3*p.f9n))/10:null}
function mprOf(p){return p&&p.rounds?Math.round(10*p.marks/p.rounds)/10:null}
/* Synthese d'une partie terminee pour un joueur (overlay + partage). */
function matchSummary(p){
  const visits=(p.dartsThrown||0)/3||p.turns||0;
  const scoredVisits=(p.turnHistory||[]).filter(v=>v>0);
  return{
    avg:visits?Math.round((p.totalScored||0)/visits):0,
    first9:(p.dartsThrown||0)>=9?Math.round(10*(p.first9||0)/3)/10:null,
    best:p.bestTurn||0,
    worst:scoredVisits.length?Math.min.apply(null,scoredVisits):null,
    dbl:(p.doublesAttempted||0)?Math.round(100*p.doublesHit/p.doublesAttempted):0,
    checkouts:p.checkouts||0,busts:p.busts||0,
    c180:p.count180||0,c140:p.count140||0,c100:p.count100||0,c60:p.count60||0,
    mpr:p.mpr!=null?p.mpr:null,
  };
}
function matchSummaryText(p,header){
  const s=matchSummary(p);
  const lines=[header||'Perfect Darts'];
  lines.push('Moyenne / volée : '+s.avg);
  if(s.first9!=null)lines.push('First 9 : '+s.first9);
  if(s.mpr!=null)lines.push('MPR : '+s.mpr);
  lines.push('Meilleure volée : '+s.best+(s.worst!=null?' · pire volée : '+s.worst:''));
  lines.push('Doubles : '+s.dbl+'% · Checkouts : '+s.checkouts+' · Busts : '+s.busts);
  lines.push('180 : '+s.c180+' · 140+ : '+s.c140+' · 100+ : '+s.c100+' · 60+ : '+s.c60);
  return lines.join('\n');
}
function renderStatsScreen(){const c=loadCareer();const wrap=document.getElementById('statsProfiles');if(!wrap)return;const names=Object.keys(c.profiles).sort((a,b)=>c.profiles[b].wins-c.profiles[a].wins||c.profiles[b].games-c.profiles[a].games);if(!names.length){wrap.innerHTML='<div class="empty-note">Aucune partie enregistrée pour l\'instant.<br>Jouez une partie : les stats s\'accumulent ici.</div>'}else{wrap.innerHTML='<table class="stats-table"><thead><tr><th>Joueur</th><th>J</th><th>V</th><th>Moy/3</th><th>F9</th><th>Meil.</th><th>180</th><th>DBL%</th><th>MPR</th></tr></thead><tbody>'+names.map(n=>{const p=c.profiles[n];const f9=f9AvgOf(p);const mpr=mprOf(p);return `<tr><td>${escapeHtml(n)}</td><td>${p.games}</td><td>${p.wins}</td><td>${avg3(p)}</td><td>${f9==null?'—':f9}</td><td>${p.bestTurn}</td><td>${p.c180}</td><td>${dblPct(p)}%</td><td>${mpr==null?'—':mpr}</td></tr>`}).join('')+'</tbody></table>'}const hist=document.getElementById('statsHistory');if(hist){if(!c.history.length){hist.innerHTML='<div class="empty-note">Pas encore d\'historique.</div>'}else{hist.innerHTML=c.history.map(h=>{const d=new Date(h.date);const when=d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});const players=h.players.map(p=>`${escapeHtml(p.name)} ${p.score}`).join(' · ');return `<div class="hist-item"><div><div class="hi-winner">${escapeHtml(h.winner)}</div><div class="hi-mode">${fmtMode(h.mode)}${h.finishDouble?' · double out':''} · ${players}</div></div><div class="hi-date">${when}</div></div>`}).join('')}}}
function resetCareer(){if(confirm('Effacer toutes les statistiques et l\'historique ?')){try{localStorage.removeItem(CAREER_KEY)}catch(e){}renderStatsScreen();showToast('Stats effacées','success')}}
