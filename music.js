// Two small pieces, played live by the browser. 1 "Sunrise": soft piano and a music-box melody.
// 2 "Evening": a slower harp with a breathy flute line. Below, the shared instruments and each piece's plan.
// "Sunrise": a small, hopeful piece played live by the browser — soft piano, a music-box melody,
// a quiet warm pad and a little room reverb. Nothing is downloaded and it is nobody else's song.
// It never repeats exactly: the arpeggio and melody are chosen afresh each bar.
(function () {
  'use strict';
  const PIECES = {
    1: { bpm: 76, level: 0.36 },
    2: { bpm: 62, level: 0.34 }
  };
  // D major, I–V–vi–IV with a lift to ii now and then (MIDI note numbers).
  const CHORDS = [
    { root: 50, tones: [62, 66, 69, 74] },   // D
    { root: 45, tones: [61, 64, 69, 73] },   // A
    { root: 47, tones: [62, 66, 71, 74] },   // Bm
    { root: 43, tones: [62, 67, 71, 74] },   // G
    { root: 50, tones: [62, 66, 69, 74] },   // D
    { root: 45, tones: [61, 64, 69, 76] },   // A
    { root: 40, tones: [59, 64, 67, 71] },   // Em
    { root: 45, tones: [61, 64, 69, 73] }    // A
  ];
  const PENTA = [74, 76, 78, 81, 83, 86, 88]; // D major pentatonic, high
  // "Evening" in F major: Fmaj7 – Am7 – Bbmaj7 – C(add9), then Dm7 – Bbmaj7 – Gm7 – C.
  const CHORDS2 = [
    { root: 41, tones: [57, 60, 64, 65, 69] }, { root: 45, tones: [57, 60, 64, 67, 72] },
    { root: 46, tones: [58, 62, 65, 69, 70] }, { root: 48, tones: [60, 62, 64, 67, 72] },
    { root: 38, tones: [57, 60, 62, 65, 69] }, { root: 46, tones: [58, 62, 65, 69, 74] },
    { root: 43, tones: [58, 62, 65, 67, 70] }, { root: 48, tones: [60, 64, 67, 70, 72] }
  ];
  const FLUTE = [72, 74, 76, 77, 79, 81, 84]; // F major, upper
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function reverb(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const c = ctx.createConvolver(); c.buffer = ir; return c;
  }

  function create(ctx, out, which) {
    const P = PIECES[which] || PIECES[1];
    const EIGHTH = 60 / P.bpm / 2;
    const master = ctx.createGain(); master.gain.value = 0;
    const dry = ctx.createGain(); dry.gain.value = 0.8;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    const rv = reverb(ctx, 2.8);
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200;
    dry.connect(warm); rv.connect(wet); wet.connect(warm); warm.connect(master); master.connect(out);
    const send = (node) => { node.connect(dry); node.connect(rv); };

    function piano(t, midi, vel, len) {
      const f = hz(midi);
      const g = ctx.createGain(); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.6), t + len);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.006); g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(([mul, type, amt]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = (Math.random() - 0.5) * 6;
        const og = ctx.createGain(); og.gain.value = amt; o.connect(og); og.connect(lp); o.start(t); o.stop(t + len + 0.05);
      });
      lp.connect(g); send(g);
    }
    function bell(t, midi, vel) {
      const f = hz(midi);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      [[1, 1], [2.0, 0.25], [3.01, 0.12], [4.2, 0.05]].forEach(([mul, amt]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
        const og = ctx.createGain(); og.gain.value = amt; o.connect(og); og.connect(g); o.start(t); o.stop(t + 2.5);
      });
      send(g);
    }
    function pad(t, tones, dur) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 1.2); g.gain.setValueAtTime(0.035, t + dur - 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(g);
      tones.slice(0, 3).forEach((m) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m - 12); o.detune.value = (Math.random() - 0.5) * 10; o.connect(lp); o.start(t); o.stop(t + dur + 0.7); });
      send(g);
    }

    function harp(t, midi, vel) {
      const f = hz(midi);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 1.2); lp.connect(g);
      [[1, 'triangle', 1], [2, 'sine', 0.22], [4, 'sine', 0.05]].forEach(([mul, type, amt]) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; const og = ctx.createGain(); og.gain.value = amt;
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + 2.7);
      });
      send(g);
    }
    function flute(t, midi, dur, vel) {
      const f = hz(midi);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.35); g.gain.setValueAtTime(vel, t + dur - 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 4.8; const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.8);
      vib.connect(vg); vg.connect(o.frequency);
      const breath = ctx.createBufferSource(); const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      breath.buffer = nb; breath.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 6; const bg = ctx.createGain(); bg.gain.value = 0.05;
      breath.connect(bp); bp.connect(bg); bg.connect(g);
      o.connect(g); o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05); breath.start(t); breath.stop(t + dur + 0.05);
      send(g);
    }
    function bar2(t, i) {
      const ch = CHORDS2[i % CHORDS2.length];
      harp(t, ch.root, 0.2); harp(t + EIGHTH * 4, ch.root + 12, 0.1);
      const up = [0, 1, 2, 3, 4, 3, 2, 1];
      up.forEach((k, s) => { if (s === 7 && Math.random() < 0.4) return; harp(t + s * EIGHTH + (Math.random() - 0.5) * 0.015, ch.tones[k], 0.07 + Math.random() * 0.03); });
      pad(t, ch.tones, EIGHTH * 8);
      if (i >= 2 && Math.random() < 0.7) {
        const pcs = ch.tones.map((m) => m % 12);
        const pool = FLUTE.filter((m) => pcs.includes(m % 12));
        const n1 = pool[Math.floor(Math.random() * pool.length)];
        flute(t + EIGHTH * 2, n1, EIGHTH * 3.5, 0.05);
        if (Math.random() < 0.6) flute(t + EIGHTH * 6, pool[Math.floor(Math.random() * pool.length)], EIGHTH * 2.5, 0.045);
      }
    }

    const PATTERNS = [[0, 1, 2, 3, 2, 1, 2, 3], [0, 2, 1, 3, 2, 3, 1, 2], [0, 1, 2, 1, 3, 2, 1, 2], [0, 2, 3, 2, 1, 2, 3, 1]];
    function bar(t, i) {
      const ch = CHORDS[i % CHORDS.length];
      const pat = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
      piano(t, ch.root, 0.22, 3.2); piano(t, ch.root + 7, 0.12, 3);
      pat.forEach((k, s) => { const hum = (Math.random() - 0.5) * 0.012; piano(t + s * EIGHTH + hum, ch.tones[k], (s % 2 ? 0.07 : 0.1) + Math.random() * 0.03, 1.6); });
      pad(t, ch.tones, EIGHTH * 8);
      // A few music-box notes, more often once the piece has settled in.
      const n = i < 2 ? 0 : [1, 2, 2, 3][Math.floor(Math.random() * 4)];
      const slots = [0, 2, 3, 4, 6, 7].sort(() => Math.random() - 0.5).slice(0, n).sort((a, b) => a - b);
      const chordPcs = ch.tones.map((m) => m % 12);
      slots.forEach((s) => {
        const pool = PENTA.filter((m) => chordPcs.includes(m % 12) || Math.random() < 0.3);
        bell(t + s * EIGHTH, pool[Math.floor(Math.random() * pool.length)] || PENTA[0], 0.06 + Math.random() * 0.03);
      });
    }

    let timer = 0; let next = 0; let idx = 0;
    return {
      start() {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(P.level, now + 2.5);
        next = now + 0.1; idx = 0;
        const play = which === 2 ? bar2 : bar;
        const tick = () => { while (next < ctx.currentTime + 1.2) { play(next, idx++); next += EIGHTH * 8; } };
        tick(); timer = setInterval(tick, 250);
      },
      stop(fade) {
        clearInterval(timer);
        const now = ctx.currentTime; const f = fade == null ? 1.5 : fade;
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now); master.gain.linearRampToValueAtTime(0, now + f);
        // Cut cleanly once faded: notes already queued and the reverb tail go with it.
        setTimeout(() => { try { master.disconnect(); } catch (e) { /* done */ } }, f * 1000 + 60);
      },
      // For an offline preview: schedule a fixed length.
      render(seconds) {
        master.gain.setValueAtTime(0, 0); master.gain.linearRampToValueAtTime(P.level, 2.5);
        master.gain.setValueAtTime(P.level, seconds - 3); master.gain.linearRampToValueAtTime(0, seconds);
        const play = which === 2 ? bar2 : bar;
        let tt = 0.1; let k = 0; while (tt < seconds - 2) { play(tt, k++); tt += EIGHTH * 8; }
      }
    };
  }

  window.AloudMusic = { create };
})();
