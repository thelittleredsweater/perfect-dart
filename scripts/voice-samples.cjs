'use strict';
/* Échantillons de voix Azure pour choisir celle de l'arbitre.
   node scripts/voice-samples.cjs  -> tests/voix/*.mp3 + tests/voix/index.html
   (dossier tests/ exclu de l'APK). Clé lue comme scripts/tts.cjs. */
const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICES = {
  fr: ['fr-FR-DeniseNeural', 'fr-FR-HenriNeural', 'fr-FR-VivienneMultilingualNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-LucienMultilingualNeural',
    'fr-FR-EloiseNeural', 'fr-FR-AlainNeural', 'fr-FR-BrigitteNeural', 'fr-FR-ClaudeNeural', 'fr-FR-JeromeNeural', 'fr-FR-YvesNeural',
    'fr-FR-JosephineNeural', 'fr-FR-CelesteNeural', 'fr-FR-CoralieNeural', 'fr-FR-JacquelineNeural', 'fr-FR-MauriceNeural', 'fr-FR-YvetteNeural',
    'fr-BE-GerardNeural', 'fr-CH-FabriceNeural', 'fr-CA-AntoineNeural'],
  en: ['en-GB-RyanNeural', 'en-GB-SoniaNeural', 'en-GB-ThomasNeural', 'en-GB-OliverNeural', 'en-GB-LibbyNeural', 'en-GB-OllieMultilingualNeural',
    'en-GB-AdaMultilingualNeural', 'en-GB-AlfieNeural', 'en-GB-ElliotNeural', 'en-GB-NoahNeural'],
};
const TEXT = { fr: 'Triple vingt. Cent quarante ! Il vous reste trente-deux.', en: 'Treble twenty. One hundred and forty! You require thirty-two.' };

function creds() {
  const f = path.join(os.homedir(), '.perfect-darts', 'azure-speech.json');
  const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
  return { key: j.key.trim(), region: j.region.trim() };
}
(async () => {
  const { key, region } = creds();
  const out = path.join(__dirname, '..', 'tests', 'voix');
  fs.mkdirSync(out, { recursive: true });
  const rows = [];
  for (const lang of ['fr', 'en']) for (const v of VOICES[lang]) {
    const loc = v.slice(0, 5);
    const body = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${loc}"><voice name="${v}">${TEXT[lang]}</voice></speak>`;
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'perfect-darts-tts' }, body,
    });
    if (!r.ok) { console.log('ignore', v, r.status); continue; }
    fs.writeFileSync(path.join(out, v + '.mp3'), Buffer.from(await r.arrayBuffer()));
    rows.push({ v, lang });
    process.stdout.write('.');
  }
  const name = v => v.replace(/^..-..-/, '').replace(/(Multilingual)?Neural$/, '');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voix de l'arbitre</title>
<style>:root{color-scheme:dark}body{margin:0;background:#0b0f1e;color:#eef1fb;font:16px system-ui,sans-serif;padding:16px}h1{font-size:1.3em;margin:0 0 4px}p{color:#9aa3c7;margin:0 0 14px}
h2{font-size:.8em;text-transform:uppercase;letter-spacing:2px;color:#ff8c5f;margin:22px 0 8px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
button{background:#1a2140;color:#fff;border:1px solid #39446b;border-radius:12px;padding:14px 12px;font:600 1em system-ui;text-align:left;cursor:pointer}button.on{border-color:#ff6b35;background:#3a2620}
small{display:block;color:#9aa3c7;font-weight:400;font-size:.75em;margin-top:2px}.speed{display:flex;align-items:center;gap:12px;background:#141a33;border-radius:12px;padding:12px}input{flex:1;accent-color:#ff6b35}</style></head><body>
<h1>Voix de l'arbitre</h1><p>Touchez une voix pour l'écouter (phrase identique pour toutes). Le curseur simule une vitesse plus lente ou plus rapide.</p>
<div class="speed">Vitesse <input type="range" id="sp" min="0.75" max="1.1" step="0.05" value="1"><b id="spv">100 %</b></div>
${['fr', 'en'].map(L => `<h2>${L === 'fr' ? 'Français' : 'Anglais'}</h2><div class="g">${rows.filter(r => r.lang === L).map(r => `<button data-f="${r.v}.mp3">${name(r.v)}<small>${r.v.slice(0, 5)}</small></button>`).join('')}</div>`).join('')}
<script>const a=new Audio();a.preservesPitch=true;const sp=document.getElementById('sp'),spv=document.getElementById('spv');sp.oninput=()=>{spv.textContent=Math.round(sp.value*100)+' %';a.playbackRate=+sp.value};
document.querySelectorAll('button').forEach(b=>b.onclick=()=>{document.querySelectorAll('button').forEach(x=>x.classList.remove('on'));b.classList.add('on');a.src=b.dataset.f;a.playbackRate=+sp.value;a.play()});</script></body></html>`;
  fs.writeFileSync(path.join(out, 'index.html'), html);
  console.log('\n' + rows.length + ' echantillons -> tests/voix/index.html');
})().catch(e => { console.error(e.message); process.exit(1); });
