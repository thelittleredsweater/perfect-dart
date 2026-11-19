'use strict';
/* Génère toutes les voix de Perfect Darts avec Azure Speech (voix neuronales, MP3).
     node scripts/tts.cjs              -> tout (dictée + arbitre, 2 langues x 2 voix)
     node scripts/tts.cjs --only=caller|voices
   Clé : AZURE_SPEECH_KEY / AZURE_SPEECH_REGION, sinon %USERPROFILE%\.perfect-darts\azure-speech.json
   ({"key":"...","region":"francecentral"}, rempli par scripts/fetch-azure-key.ps1).
   Sorties (f = voix féminine, m = masculine, réglage « Type de voix ») :
     sounds/voice/<fr|en>/<f|m>/  n1..n20, d1..d20, t1..t20, manque, bull, double-bull, jeu, rien (.mp3)
     sounds/caller/<fr|en>/<f|m>/ 1..180, reste (.mp3)
   Changer de voix : modifier VOICES ci-dessous (liste : scripts/voice-samples.cjs). */
const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICES = {
  fr: { f: 'fr-FR-VivienneMultilingualNeural', m: 'fr-FR-RemyMultilingualNeural' },
  en: { f: 'en-GB-SoniaNeural', m: 'en-GB-RyanNeural' },
};
const LOCALE = { fr: 'fr-FR', en: 'en-GB' };
const RATE = '-5%'; // rythme posé d'arbitre (0% = vitesse par défaut de la voix)

const NUM = {
  fr: ['', 'Un', 'Deux', 'Trois', 'Quatre', 'Cinq', 'Six', 'Sept', 'Huit', 'Neuf', 'Dix', 'Onze', 'Douze', 'Treize', 'Quatorze', 'Quinze', 'Seize', 'Dix-sept', 'Dix-huit', 'Dix-neuf', 'Vingt'],
  en: ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'],
};
const WORDS = {
  fr: { d: 'Double', t: 'Triple', manque: 'Manqué', bull: 'Bull', 'double-bull': 'Double bull', jeu: 'Jeu !', rien: 'Pas de score !', reste: 'Il vous reste' },
  en: { d: 'Double', t: 'Treble', manque: 'Miss', bull: 'Bull', 'double-bull': 'Double bull', jeu: 'Game shot!', rien: 'No score!', reste: 'You require' },
};

function lines(only) {
  const out = [];
  for (const lang of ['fr', 'en']) for (const g of ['f', 'm']) {
    const W = WORDS[lang], v = `sounds/voice/${lang}/${g}/`, c = `sounds/caller/${lang}/${g}/`;
    if (only !== 'caller') {
      for (let n = 1; n <= 20; n++) {
        out.push({ file: v + `n${n}.mp3`, lang, g, text: NUM[lang][n] });
        out.push({ file: v + `d${n}.mp3`, lang, g, text: W.d + ' ' + NUM[lang][n].toLowerCase() });
        out.push({ file: v + `t${n}.mp3`, lang, g, text: W.t + ' ' + NUM[lang][n].toLowerCase() });
      }
      for (const k of ['manque', 'bull', 'double-bull', 'jeu', 'rien']) out.push({ file: v + k + '.mp3', lang, g, text: W[k] });
    }
    if (only !== 'voices') {
      out.push({ file: c + 'reste.mp3', lang, g, text: W.reste });
      for (let n = 1; n <= 180; n++) out.push({ file: c + n + '.mp3', lang, g, text: String(n) });
    }
  }
  return out;
}

function creds() {
  let key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  const f = path.join(os.homedir(), '.perfect-darts', 'azure-speech.json');
  if ((!key || !region) && fs.existsSync(f)) {
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); key = key || j.key; region = region || j.region; }
    catch (e) { throw new Error('Fichier de cle illisible : ' + f); }
  }
  if (!key || !region || /COLLE/.test(key)) throw new Error('Cle Azure manquante : lancer scripts/fetch-azure-key.ps1 ou remplir ' + f);
  return { key: key.trim(), region: region.trim() };
}

const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function ssml(l) {
  const voice = VOICES[l.lang][l.g], loc = LOCALE[l.lang];
  /* Les voix « Multilingual » détectent la langue : on la force pour les nombres. */
  const inner = `<prosody rate="${RATE}">${xml(l.text)}</prosody>`;
  const body = /Multilingual/.test(voice) ? `<lang xml:lang="${loc}">${inner}</lang>` : inner;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${loc}"><voice name="${voice}">`
    + '<mstts:silence type="Leading-exact" value="0ms"/><mstts:silence type="Tailing-exact" value="0ms"/>' + body + '</voice></speak>';
}

async function synth(l, { key, region }) {
  for (let tries = 0; tries < 8; tries++) {
    const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'perfect-darts-tts' },
      body: ssml(l),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (tries + 1))); continue; }
    throw new Error(`Azure ${r.status} sur "${l.text}" (${VOICES[l.lang][l.g]}) : ${await r.text()}`);
  }
  throw new Error('Azure : trop de requetes, reessaie plus tard');
}

(async () => {
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
  const c = creds(), root = path.join(__dirname, '..'), list = lines(only);
  console.log(list.length + ' phrases (Azure, MP3)');
  let i = 0;
  /* 4 requêtes en parallèle : rapide, et sous la limite de l'offre gratuite. */
  const worker = async () => {
    while (i < list.length) {
      const l = list[i++];
      const buf = await synth(l, c);
      const f = path.join(root, l.file);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
      process.stdout.write('.');
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log('\nok');
})().catch(e => { console.error('\n' + e.message); process.exit(1); });
