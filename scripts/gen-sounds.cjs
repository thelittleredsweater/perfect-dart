'use strict';
/* Générateur des sons originaux de Perfect Darts (aucune source externe).
   - Jingles synthétisés (additif + enveloppes) : start, big, perfect, checkout, win.
   - Annonces vocales : fichiers TTS bruts (22,05 kHz mono 16 bits) dans le dossier
     passé en argument (<dir>/fr_start.wav, en_win.wav…), traités (silences coupés,
     normalisation, légère réverb « arène ») puis mixés sur le jingle.
   - --voices : retraite aussi sounds/voice/fr/*.wav (dictée des fléchettes) :
     silences coupés + volume homogène (sauvegarde *.orig non écrite : git suffit).
   Remplacer les voix : déposer de nouveaux WAV mono 16 bits aux mêmes noms et relancer.
   Usage : node scripts/gen-sounds.cjs <dossierTTS> [--voices] */
const fs = require('fs');
const path = require('path');
const SR = 22050;
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'sounds', 'fx');

/* ---------- WAV ---------- */
function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + len);
    p += 8 + len + (len & 1);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error('WAV 16 bits attendu : ' + file);
  const n = Math.floor(data.length / 2 / fmt.ch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < fmt.ch; c++) s += data.readInt16LE((i * fmt.ch + c) * 2); out[i] = s / fmt.ch / 32768; }
  return { rate: fmt.rate, s: out };
}
function writeWav(file, s, rate = SR) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}

/* ---------- traitement ---------- */
function trim(s, rate, thr = 0.012, padMs = 25) {
  let a = 0, z = s.length - 1;
  while (a < s.length && Math.abs(s[a]) < thr) a++;
  while (z > a && Math.abs(s[z]) < thr) z--;
  const pad = Math.round(rate * padMs / 1000);
  return s.slice(Math.max(0, a - pad), Math.min(s.length, z + pad));
}
function normalize(s, peak = 0.89) { let m = 0; for (const v of s) m = Math.max(m, Math.abs(v)); if (!m) return s; const g = peak / m; return s.map(v => v * g); }
function fade(s, rate, inMs = 4, outMs = 30) { const a = Math.round(rate * inMs / 1000), z = Math.round(rate * outMs / 1000); for (let i = 0; i < a && i < s.length; i++) s[i] *= i / a; for (let i = 0; i < z && i < s.length; i++) s[s.length - 1 - i] *= i / z; return s; }
/* Réverb légère (peignes de Schroeder) -> présence « salle », mix sec dominant. */
function reverb(s, rate, wet = 0.16, tail = 0.45) {
  const out = new Float32Array(s.length + Math.round(rate * tail));
  out.set(s);
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map(t => Math.round(t * rate));
  const acc = new Float32Array(out.length);
  for (const d of combs) { const buf = new Float32Array(out.length); for (let i = 0; i < out.length; i++) { const x = i < s.length ? s[i] : 0; buf[i] = x + (i >= d ? buf[i - d] * 0.72 : 0); acc[i] += buf[i] / combs.length; } }
  for (let i = 0; i < out.length; i++) out[i] = out[i] + acc[i] * wet;
  return out;
}
function resample(s, from, to) { if (from === to) return s; const n = Math.round(s.length * to / from), o = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * from / to, j = Math.floor(x), f = x - j; o[i] = (s[j] || 0) * (1 - f) + (s[j + 1] || 0) * f; } return o; }

/* ---------- synthèse ---------- */
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
/* Note : somme d'harmoniques (timbre cuivré doux) + enveloppe ADSR simple. */
function note(buf, t0, midi, dur, amp = 0.3, bright = 0.5, vib = 0) {
  const f = hz(midi), a0 = Math.round(t0 * SR), n = Math.round(dur * SR), att = 0.012 * SR, rel = Math.min(0.25 * SR, n * 0.5);
  for (let i = 0; i < n && a0 + i < buf.length; i++) {
    const t = i / SR, ph = 2 * Math.PI * f * t + (vib ? Math.sin(2 * Math.PI * 5.5 * t) * vib : 0);
    let v = Math.sin(ph) + bright * 0.5 * Math.sin(2 * ph) + bright * 0.28 * Math.sin(3 * ph) + bright * 0.12 * Math.sin(5 * ph);
    const env = i < att ? i / att : i > n - rel ? (n - i) / rel : 1 - 0.25 * (i / n);
    buf[a0 + i] += v * env * amp;
  }
}
/* Percussion grave (grosse caisse/timbale) : sinus glissant + bruit filtré. */
function hit(buf, t0, amp = 0.6, f0 = 110) {
  const a0 = Math.round(t0 * SR), n = Math.round(0.45 * SR); let lp = 0, seed = 7;
  for (let i = 0; i < n && a0 + i < buf.length; i++) {
    const t = i / SR, f = f0 * (1 + 1.6 * Math.exp(-t * 30));
    seed = (seed * 16807) % 2147483647; lp += ((seed / 2147483647 - 0.5) - lp) * 0.08;
    buf[a0 + i] += (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 7) + lp * 2.2 * Math.exp(-t * 18)) * amp;
  }
}
/* Scintillement (cloches aiguës) pour les gros scores. */
function sparkle(buf, t0, count, amp = 0.08) { for (let k = 0; k < count; k++) note(buf, t0 + k * 0.045, 84 + [0, 4, 7, 12, 16, 19][k % 6], 0.35, amp, 0.15); }
function render(len, fn) { const b = new Float32Array(Math.round(len * SR)); fn(b); return b; }

const JINGLES = {
  /* Ouverture : roulement montant + accord majeur. */
  start: () => render(1.6, b => { hit(b, 0, .5, 90); hit(b, .18, .45, 100); [60, 64, 67].forEach((m, i) => note(b, .05 + i * .11, m, .5, .2)); [72, 67, 64, 60].forEach(m => note(b, .42, m, 1.05, .16, .7)); hit(b, .42, .55, 80); }),
  /* Gros score : deux notes brillantes. */
  big: () => render(1.0, b => { note(b, 0, 76, .22, .22, .8); note(b, .14, 83, .7, .24, .8); sparkle(b, .16, 4, .05); }),
  /* 180 : arpège rapide + accord + scintillement. */
  perfect: () => render(1.8, b => { [60, 64, 67, 72, 76, 79].forEach((m, i) => note(b, i * .06, m, .3, .18, .7)); hit(b, .36, .6, 70); [84, 79, 76, 72, 60].forEach(m => note(b, .36, m, 1.3, .13, .8, .15)); sparkle(b, .4, 10, .06); }),
  /* Finish possible : tension (pulsation grave, quarte augmentée). */
  checkout: () => render(1.1, b => { hit(b, 0, .45, 75); note(b, 0, 45, .5, .25, .4); hit(b, .3, .4, 75); note(b, .3, 51, .7, .25, .5, .1); note(b, .3, 57, .7, .12, .6); }),
  /* Victoire : fanfare I-IV-V-I. */
  win: () => render(2.6, b => { const ch = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79, 84]]; ch.forEach((c, i) => { const t = i * .28, d = i === 3 ? 1.6 : .3; hit(b, t, i === 3 ? .6 : .35, 85); c.forEach(m => note(b, t, m, d, .14, .8, i === 3 ? .12 : 0)); }); sparkle(b, .9, 12, .05); }),
};
/* Décalage de la voix dans le jingle (s) et gain du jingle sous la voix. */
const VOICE_AT = { start: .55, big: .25, perfect: .5, checkout: .2, win: 1.0 };

function mix(j, v, at, duck = 0.45) {
  const a = Math.round(at * SR), out = new Float32Array(Math.max(j.length, a + v.length));
  for (let i = 0; i < out.length; i++) {
    const vi = i - a, inV = vi >= 0 && vi < v.length;
    out[i] = (j[i] || 0) * (inV ? duck : 1) + (inV ? v[vi] : 0);
  }
  return normalize(out, 0.9);
}

function main() {
  const ttsDir = process.argv[2];
  /* Jingles originaux : seulement avec --fx (l'app utilise actuellement ses effets d'origine). */
  for (const k of process.argv.includes('--fx') ? Object.keys(JINGLES) : []) {
    const j = fade(normalize(JINGLES[k](), 0.8), SR, 2, 60);
    writeWav(path.join(OUT, k + '.wav'), j);
    if (!ttsDir) continue;
    for (const lang of ['fr', 'en']) {
      const f = path.join(ttsDir, lang + '_' + k + '.wav');
      if (!fs.existsSync(f)) continue;
      const w = readWav(f);
      const v = reverb(normalize(trim(resample(w.s, w.rate, SR), SR), 0.95), SR);
      writeWav(path.join(OUT, lang, k + '.wav'), fade(mix(j, v, VOICE_AT[k]), SR, 2, 80));
    }
  }
  /* Dictée des fléchettes : <dossierTTS>/voice-<lang>/*.wav -> sounds/voice/<lang>/ (16 kHz : poids réduit). */
  if (process.argv.includes('--voices') && ttsDir) {
    for (const lang of ['fr', 'en']) {
      const src = path.join(ttsDir, 'voice-' + lang);
      if (!fs.existsSync(src)) continue;
      for (const f of fs.readdirSync(src).filter(x => x.endsWith('.wav'))) {
        const w = readWav(path.join(src, f)), r = 16000;
        const s = resample(trim(w.s, w.rate), w.rate, r);
        writeWav(path.join(ROOT, 'sounds', 'voice', lang, f), fade(reverb(normalize(s, 0.92), r, 0.1, 0.3), r), r);
      }
    }
  }
  console.log('sons generes dans', path.relative(ROOT, OUT));
}
main();
