// A gentle gate for speech: while you are silent, room noise is turned down (not cut),
// and it opens instantly when you speak, holding a moment so word endings are kept.
class VoiceGate extends AudioWorkletProcessor {
  constructor() {
    super();
    this.env = 0; this.gain = 1; this.hold = 0;
    this.open = Math.pow(10, -46 / 20);   // speech above about -46 dBFS opens the gate
    this.floor = Math.pow(10, -14 / 20);  // silence is lowered by 14 dB, never muted
    this.holdSamples = sampleRate * 0.3;
  }
  process(inputs, outputs) {
    const inp = inputs[0][0]; const out = outputs[0][0];
    if (!inp || !out) return true;
    const att = Math.exp(-1 / (sampleRate * 0.004)); const rel = Math.exp(-1 / (sampleRate * 0.12));
    const gUp = 1 - Math.exp(-1 / (sampleRate * 0.006)); const gDown = 1 - Math.exp(-1 / (sampleRate * 0.25));
    for (let i = 0; i < inp.length; i++) {
      const x = Math.abs(inp[i]);
      this.env = x > this.env ? att * this.env + (1 - att) * x : rel * this.env + (1 - rel) * x;
      if (this.env > this.open) this.hold = this.holdSamples; else if (this.hold > 0) this.hold--;
      const target = this.hold > 0 ? 1 : this.floor;
      this.gain += (target - this.gain) * (target > this.gain ? gUp : gDown);
      out[i] = inp[i] * this.gain;
    }
    return true;
  }
}
registerProcessor('voice-gate', VoiceGate);
