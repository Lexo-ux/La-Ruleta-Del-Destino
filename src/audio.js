/**
 * Synthesizes all roulette sound effects locally using Web Audio API.
 * Strictly avoids external audio assets to comply with Discord Activity CSP.
 */
export class SoundEngine {
  constructor(initialMuted = false) {
    this.muted = Boolean(initialMuted);
    this.ctx = null;
    this.noiseBuffer = null;
    this.lastTickTime = 0;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  isMuted() {
    return this.muted;
  }

  ensureContext() {
    if (this.muted) return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (!this.noiseBuffer && this.ctx) {
      try {
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 0.04);
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.25));
        }
        this.noiseBuffer = buffer;
      } catch {
        // Ignore buffer allocation failure
      }
    }

    return this.ctx;
  }

  unlock() {
    if (!this.muted) {
      this.ensureContext();
    }
  }

  /**
   * Plays a crisp mechanical "tic" sound when a slice boundary crosses the pointer.
   * @param {number} speedRatio Normalized spin speed (0..1)
   */
  playTick(speedRatio = 0.5) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const nowMs = performance.now();
    if (nowMs - this.lastTickTime < 18) return;
    this.lastTickTime = nowMs;

    try {
      const now = ctx.currentTime;
      const clampedSpeed = Math.max(0, Math.min(1, speedRatio));

      // Percussive pitched body
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';

      const startFreq = 780 + clampedSpeed * 420;
      const endFreq = 260 + clampedSpeed * 90;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.026);

      const peakGain = 0.14 + clampedSpeed * 0.08;
      oscGain.gain.setValueAtTime(0.001, now);
      oscGain.gain.linearRampToValueAtTime(peakGain, now + 0.002);
      oscGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.032);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);

      // Subtle transient click snap
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200 + clampedSpeed * 900, now);
        filter.Q.setValueAtTime(2.5, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.09, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
      }
    } catch {
      // Ignore Web Audio errors in headless/restricted environments
    }
  }

  /**
   * Plays a celebratory short arpeggio when a winner is chosen.
   */
  playVictory() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Bright C major 9th chord arpeggio (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];

      notes.forEach((freq, idx) => {
        const start = now + idx * 0.075;
        const duration = idx === notes.length - 1 ? 0.48 : 0.24;

        const osc = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, start);

        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.18, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.16, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0008, start + duration);

        osc.connect(gain);
        overtone.connect(overtoneGain);
        overtoneGain.connect(gain);
        gain.connect(ctx.destination);

        osc.start(start);
        overtone.start(start);
        osc.stop(start + duration + 0.02);
        overtone.stop(start + duration + 0.02);
      });
    } catch {
      // Ignore Web Audio errors in headless/restricted environments
    }
  }
}
