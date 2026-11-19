/* Outil de vérification de mise en page (navigateur, dev uniquement — exclu de l'APK).
   Charger dans la console : s=document.createElement('script');s.src='tests/ui-audit.js';document.head.appendChild(s)
   puis : await __start('501',2)  /  __audit()
   Signale : défilement horizontal, éléments hors écran, boutons sous la ligne de flottaison
   en partie, cibles tactiles < 38 px, textes coupés. */
window.__audit = function () {
  const W = innerWidth, H = innerHeight;
  const out = { vw: W + 'x' + H, hscroll: document.documentElement.scrollWidth > W, docH: document.documentElement.scrollHeight, overflow: [], small: [], clipped: [] };
  const scr = document.querySelector('.screen.active');
  const root = document.querySelector('.winner-overlay.active,.net-overlay.show') || scr;
  root.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const name = (el.id ? '#' + el.id : '') + '.' + [...el.classList].join('.') + ' ' + (el.textContent || '').trim().slice(0, 14);
    if (r.right > W + 1 || r.left < -1) out.overflow.push(name + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    if (r.bottom > H + 1 && root === scr && scr.id === 'screenGame' && el.matches('button')) out.overflow.push('BELOW ' + name + ' ' + Math.round(r.bottom));
    if (el.matches('button,select,input,a') && (r.height < 38 || r.width < 38)) out.small.push(name + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== 'visible' && !el.matches('.hud-scores,.log-toggle-btn')) out.clipped.push(name);
  });
  out.overflow = out.overflow.slice(0, 12); out.small = out.small.slice(0, 15); out.clipped = out.clipped.slice(0, 10);
  return out;
};
window.__start = async function (mode, n) {
  document.getElementById('cfgMode').value = mode;
  PLAYER_COUNT = n; updatePlayerInputs(); applyModeFieldVisibility(); startGame();
  if (mode !== 'cricket' && mode !== 'around') throwDart(20, 3);
  await new Promise(r => setTimeout(r, 600));
  return __audit();
};
