'use strict';

// Würfel-Klänge, alle im Browser erzeugt (keine Dateien).
// Jeder Klang hat
//   roll(ctx, out, t0, ticks): Klang während des Rollens; ticks = Zeitpunkte (s) der Bildwechsel
//   finale(ctx, out, t): Abschluss, wenn die Aufgabe steht
//   speechDelay: so viele Sekunden nach dem Abschluss beginnt die Ansage

const SOUND_LIST = [
  { key: 'trommel', name: '🥁 Trommelwirbel' },
  { key: 'tusch', name: '🎺 Tusch' },
  { key: 'gluecksrad', name: '🎡 Glücksrad' },
  { key: 'xylophon', name: '🎵 Xylophon' },
  { key: 'zauber', name: '✨ Zauberstab' },
  { key: 'aus', name: '🔇 Kein Klang' },
];

let noiseCache = null;

function noise(ctx) {
  if (!noiseCache || noiseCache.sampleRate !== ctx.sampleRate) {
    noiseCache = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseCache.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseCache;
}

// Hüllkurve: schneller Anstieg, exponentielles Abklingen
function env(ctx, t, peak, attack, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noiseHit(ctx, out, t, { peak, decay, type = 'bandpass', freq = 2500, q = 0.7, attack = 0.002 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = env(ctx, t, peak, attack, decay);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t, Math.random() * 1.5, attack + decay + 0.05);
}

function tone(ctx, out, t, { freq, peak, decay, type = 'sine', attack = 0.004, glideTo = null, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
  o.detune.value = detune;
  const g = env(ctx, t, peak, attack, decay);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + attack + decay + 0.05);
}

// Ein Schlag auf die kleine Trommel: Rauschen (Teppich) + kurzer Fellton
function snareStroke(ctx, out, t, v) {
  noiseHit(ctx, out, t, { peak: 0.35 * v, decay: 0.07, type: 'highpass', freq: 1800, q: 0.5 });
  noiseHit(ctx, out, t, { peak: 0.25 * v, decay: 0.05, freq: 4500, q: 1.2 });
  tone(ctx, out, t, { freq: 210, glideTo: 160, peak: 0.18 * v, decay: 0.06, type: 'triangle' });
}

// Wirbel: immer dichtere, lauter werdende Schläge mit leichten Zufallsschwankungen
function snareRoll(ctx, out, t0, dur, loud = 1) {
  let t = t0;
  while (t < t0 + dur) {
    const p = (t - t0) / dur;
    snareStroke(ctx, out, t, loud * (0.35 + 0.65 * p) * (0.85 + Math.random() * 0.3));
    t += 1 / (16 + 14 * p) + (Math.random() - 0.5) * 0.006;
  }
}

function crash(ctx, out, t, v = 1) {
  noiseHit(ctx, out, t, { peak: 0.45 * v, decay: 1.4, type: 'highpass', freq: 5000, q: 0.3, attack: 0.003 });
  noiseHit(ctx, out, t, { peak: 0.2 * v, decay: 0.6, freq: 8000, q: 0.8 });
}

function kick(ctx, out, t, v = 1) {
  tone(ctx, out, t, { freq: 120, glideTo: 45, peak: 0.55 * v, decay: 0.28, attack: 0.002 });
}

// Blechbläser-Akkord: Sägezahn mit sich öffnendem Tiefpass
function brass(ctx, out, t, freqs, len, v) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = 1.5;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
  f.frequency.exponentialRampToValueAtTime(1400, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  const per = 0.5 / (freqs.length * 2);   // Summe aller Stimmen bleibt unter Vollaussteuerung
  g.gain.exponentialRampToValueAtTime(per * v, t + 0.03);
  g.gain.setValueAtTime(per * 0.85 * v, t + Math.max(0.04, len - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.15);
  f.connect(g); g.connect(out);
  for (const fr of freqs) {
    for (const det of [-7, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + len + 0.2);
    }
  }
}

// Holzstab-Ton (Xylophon/Marimba): Grundton + heller Oberton, kurz
function mallet(ctx, out, t, freq, v = 1, decay = 0.35) {
  tone(ctx, out, t, { freq, peak: 0.35 * v, decay, attack: 0.002 });
  tone(ctx, out, t, { freq: freq * 4, peak: 0.08 * v, decay: decay * 0.3, attack: 0.001 });
  tone(ctx, out, t, { freq: freq * 10, peak: 0.03 * v, decay: 0.03, attack: 0.001 });
}

// Glocke: unharmonische Teiltöne, lang ausklingend
function bell(ctx, out, t, freq, v = 1, decay = 1.2) {
  [[1, 0.3], [2.76, 0.12], [5.4, 0.06], [8.93, 0.03]].forEach(([m, a]) =>
    tone(ctx, out, t, { freq: freq * m, peak: a * v, decay: decay / Math.sqrt(m), attack: 0.002 }));
}

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

const SOUNDS = {
  trommel: {
    roll: (ctx, out, t0, ticks) => snareRoll(ctx, out, t0, ticks[ticks.length - 1] + 0.1),
    finale: (ctx, out, t) => { kick(ctx, out, t); crash(ctx, out, t, 0.8); snareStroke(ctx, out, t, 0.9); },
    speechDelay: 0.35,
  },
  tusch: {
    roll: (ctx, out, t0, ticks) => snareRoll(ctx, out, t0, ticks[ticks.length - 1] + 0.1, 0.7),
    finale: (ctx, out, t) => {
      // „ta-TAAA“: kurzer Auftakt, dann langer Dur-Akkord mit Becken
      brass(ctx, out, t, [midi(60), midi(64), midi(67)], 0.11, 0.8);
      brass(ctx, out, t + 0.16, [midi(60), midi(64), midi(67), midi(72)], 0.75, 1);
      kick(ctx, out, t + 0.16, 0.8);
      crash(ctx, out, t + 0.16, 0.7);
    },
    speechDelay: 1.0,
  },
  gluecksrad: {
    // Ein Klick pro Bildwechsel – das Rad wird hörbar langsamer
    roll: (ctx, out, t0, ticks) => ticks.forEach((tt, i) => {
      noiseHit(ctx, out, t0 + tt, { peak: 0.5, decay: 0.018, freq: 2200, q: 3 });
      tone(ctx, out, t0 + tt, { freq: 1100 - i * 20, peak: 0.12, decay: 0.02, type: 'square' });
    }),
    finale: (ctx, out, t) => { bell(ctx, out, t, midi(84), 1, 1.4); bell(ctx, out, t + 0.002, midi(91), 0.5, 1.2); },
    speechDelay: 0.45,
  },
  xylophon: {
    // Aufsteigende Pentatonik, ein Ton pro Bildwechsel
    roll: (ctx, out, t0, ticks) => {
      const scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86];
      ticks.forEach((tt, i) => mallet(ctx, out, t0 + tt, midi(scale[i % scale.length]), 0.7, 0.25));
    },
    finale: (ctx, out, t) => {
      [72, 76, 79, 84].forEach((n, i) => mallet(ctx, out, t + i * 0.07, midi(n), 1, 0.6));
    },
    speechDelay: 0.55,
  },
  zauber: {
    roll: (ctx, out, t0, ticks) => {
      const dur = ticks[ticks.length - 1] + 0.12;
      // aufsteigendes Glitzern: mehrere leicht verstimmte Sinustöne gleiten nach oben
      [0, 7, 12].forEach((iv, k) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(midi(72 + iv), t0);
        o.frequency.exponentialRampToValueAtTime(midi(84 + iv), t0 + dur);
        const trem = ctx.createOscillator();
        trem.frequency.value = 14 + k * 3;
        const tg = ctx.createGain(); tg.gain.value = 0.04;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.11, t0 + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.1);
        trem.connect(tg); tg.connect(g.gain);
        o.connect(g); g.connect(out);
        o.start(t0); trem.start(t0); o.stop(t0 + dur + 0.15); trem.stop(t0 + dur + 0.15);
      });
      ticks.forEach((tt) => bell(ctx, out, t0 + tt, midi(96 + Math.floor(Math.random() * 7)), 0.4, 0.3));
    },
    finale: (ctx, out, t) => {
      [88, 91, 95, 100, 96, 103].forEach((n, i) => bell(ctx, out, t + i * 0.06, midi(n), 0.75, 0.9));
    },
    speechDelay: 0.5,
  },
  aus: { roll: () => {}, finale: () => {}, speechDelay: 0.05 },
};
