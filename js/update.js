'use strict';
/* ============================================================
   Mises à jour au démarrage.
   - Le relais publie /version.json ({version, notes}) à chaque déploiement.
   - Appli Android (APK) : son code est figé dans l'APK. Si une version plus
     récente existe, un bandeau propose de la télécharger (Android interdit
     l'installation silencieuse hors Play Store).
   - Appli web / iPhone : le service worker recharge déjà le code depuis le réseau ;
     si la page affichée est en retard, on recharge une fois, puis on annonce
     « mise à jour installée ».
   ============================================================ */
const UPDATE_SNOOZE_KEY = 'perfectdarts_update_snooze_v1';
const UPDATE_SEEN_KEY = 'perfectdarts_version_seen_v1';
function verCmp(a, b) { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
function isApk() { return typeof netIsLocalApp === 'function' ? netIsLocalApp() : location.host === 'appassets.androidplatform.net'; }
function updateBase() { const o = typeof onlineServer === 'function' ? onlineServer() : (typeof ONLINE_SERVER === 'string' ? ONLINE_SERVER : ''); return isApk() ? o : (location.origin || o); }
async function fetchLatest() {
  const base = updateBase(); if (!base || typeof fetch !== 'function') return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null; const to = setTimeout(() => ctl && ctl.abort(), 6000);
  try { const r = await fetch(base.replace(/\/+$/, '') + '/version.json?t=' + Date.now(), { cache: 'no-store', signal: ctl ? ctl.signal : undefined }); if (!r.ok) return null; const j = await r.json(); return j && j.version ? j : null; }
  catch (e) { return null; } finally { clearTimeout(to); }
}
/* Bandeau sur l'écran d'accueil (APK). */
function showUpdateBanner(info) {
  const el = document.getElementById('updateBanner'); if (!el) return;
  const notes = (info.notes || []).slice(0, 4).map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const url = updateBase().replace(/\/+$/, '') + '/android';
  el.innerHTML = `<div class="ub-top"><span class="ub-ic">🆕</span><div><b>Perfect Darts ${escapeHtml(info.version)} est disponible</b><small>Tu as la version ${escapeHtml(APP_VERSION)}</small></div></div>${notes ? '<ul>' + notes + '</ul>' : ''}
    <div class="ub-actions"><a class="btn btn-primary btn-sm" href="${url}" target="_blank" rel="noopener">⬇️ Mettre à jour</a><button type="button" class="btn btn-ghost btn-sm" onclick="snoozeUpdate('${escapeHtml(info.version)}')">Plus tard</button></div>
    <div class="ub-hint">Installe la nouvelle version par-dessus : tes stats sont conservées.</div>`;
  el.style.display = '';
}
function snoozeUpdate(v) { try { localStorage.setItem(UPDATE_SNOOZE_KEY, JSON.stringify({ v, until: Date.now() + 24 * 3600e3 })); } catch (e) {} const el = document.getElementById('updateBanner'); if (el) el.style.display = 'none'; }
function snoozed(v) { try { const s = JSON.parse(localStorage.getItem(UPDATE_SNOOZE_KEY) || 'null'); return s && s.v === v && Date.now() < s.until; } catch (e) { return false; } }
async function checkForUpdate(manual) {
  const info = await fetchLatest();
  const st = document.getElementById('updateStatus');
  if (!info) { if (manual) { if (st) st.textContent = 'Impossible de vérifier (pas de connexion ?)'; showToast('Vérification impossible', 'error'); } return; }
  const newer = verCmp(info.version, APP_VERSION) > 0;
  if (!newer) { if (manual) { if (st) st.textContent = '✅ Tu as la dernière version (' + APP_VERSION + ')'; showToast('Tu as la dernière version', 'success'); } return; }
  if (isApk()) { if (manual || !snoozed(info.version)) showUpdateBanner(info); if (st) st.textContent = '🆕 Version ' + info.version + ' disponible'; return; }
  /* Web : la page en cache est en retard -> on recharge une seule fois. */
  try { if (sessionStorage.getItem('pd_upd_reload') !== info.version) { sessionStorage.setItem('pd_upd_reload', info.version); location.reload(); } } catch (e) {}
}
/* Annonce une fois la mise à jour installée (web et APK). */
function announceInstalledVersion() {
  let seen = ''; try { seen = localStorage.getItem(UPDATE_SEEN_KEY) || ''; localStorage.setItem(UPDATE_SEEN_KEY, APP_VERSION); } catch (e) { return; }
  if (seen && verCmp(APP_VERSION, seen) > 0) setTimeout(() => showToast('✅ Perfect Darts mis à jour en ' + APP_VERSION, 'success'), 1200);
}
function initUpdates() {
  const v = document.getElementById('appVersion'); if (v) v.textContent = APP_VERSION;
  if (new URLSearchParams(location.search).get('tv')) return; /* écran TV : pas de bandeau */
  announceInstalledVersion();
  setTimeout(() => { checkForUpdate(false); }, 2500);
}
