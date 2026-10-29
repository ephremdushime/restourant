/**
 * RestoPass Central Scanner & POS Sound Service (Web Audio API)
 * Provides two distinct, loud, unmistakable scanner station sounds:
 *  - Sound 1: playSuccessSound() — Loud, bright, ascending dual-tone confirmation chime (1760Hz -> 2637Hz)
 *              played after a meal deduction succeeds. Cuts cleanly through noisy cafeteria crowds.
 *  - Sound 2: playFailureSound() — Loud, deep, abrasive dual-pulse rejection alarm ("BUZZ-BUZZ", 160Hz+180Hz)
 *              played whenever a scan is denied, expired, or invalid.
 * Includes dynamics compression/limiting, volume control (default 100%), preloading, and event deduplication.
 */

class AudioService {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private volume = 1.0; // 0.0 to 1.0 (default 100% full volume for busy restaurant/canteen dining halls)
  private audioUnlocked = false;
  private lastPlayedEventKey: string | null = null;
  private lastPlayedTimestamp = 0;
  private masterCompressor: DynamicsCompressorNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedVol = localStorage.getItem('restopass_scanner_volume');
        if (savedVol !== null) {
          const parsed = parseFloat(savedVol);
          if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.volume = parsed;
          }
        }
        const savedEnabled = localStorage.getItem('restopass_scanner_sound_enabled');
        if (savedEnabled !== null) {
          this.soundEnabled = savedEnabled !== 'false';
        }
      } catch {}
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx) {
      if (this.ctx.state === 'running') {
        this.audioUnlocked = true;
      } else if (this.ctx.state === 'suspended') {
        this.ctx
          .resume()
          .then(() => {
            if (this.ctx?.state === 'running') {
              this.audioUnlocked = true;
            }
          })
          .catch(() => {});
      }
    }
    return this.ctx;
  }

  /**
   * Routes all sounds through a dedicated dynamics compressor / limiter.
   * Allows sounds to play at maximum acoustic punch and volume without digital clipping or distortion.
   */
  private getMasterOutput(ctx: AudioContext): AudioNode {
    if (!this.masterCompressor || this.masterCompressor.context !== ctx) {
      try {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-6, ctx.currentTime);
        comp.knee.setValueAtTime(6, ctx.currentTime);
        comp.ratio.setValueAtTime(12, ctx.currentTime);
        comp.attack.setValueAtTime(0.002, ctx.currentTime);
        comp.release.setValueAtTime(0.12, ctx.currentTime);
        comp.connect(ctx.destination);
        this.masterCompressor = comp;
      } catch {
        return ctx.destination;
      }
    }
    return this.masterCompressor || ctx.destination;
  }

  /**
   * Preloads the Web Audio synthesizer context when the scanner station starts
   */
  public preloadScannerSounds(): void {
    try {
      this.getContext();
    } catch {}
  }

  /**
   * Explicitly unlocks browser audio on user gesture (click / tap / keypress)
   */
  public async unlockAudio(): Promise<boolean> {
    if (typeof window === 'undefined') return true;
    try {
      const ctx = this.getContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      // Play a silent 1ms buffer to unlock iOS/Chrome WebAudio policy
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      this.audioUnlocked = ctx.state === 'running';
      return this.audioUnlocked;
    } catch {
      return false;
    }
  }

  public isAudioUnlocked(): boolean {
    if (typeof window === 'undefined') return true;
    if (this.ctx && this.ctx.state === 'running') {
      this.audioUnlocked = true;
    }
    return this.audioUnlocked;
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('restopass_scanner_sound_enabled', String(enabled));
      } catch {}
    }
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('restopass_scanner_volume', String(this.volume));
      } catch {}
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  /**
   * Prevents duplicate sound playback if a scan event is retried or UI re-renders
   */
  private shouldSuppressDuplicate(eventKey?: string): boolean {
    const now = Date.now();
    if (eventKey) {
      if (this.lastPlayedEventKey === eventKey && now - this.lastPlayedTimestamp < 400) {
        return true;
      }
      this.lastPlayedEventKey = eventKey;
      this.lastPlayedTimestamp = now;
      return false;
    }
    return false;
  }

  /**
   * Sound 1 — Successful scan (ACCEPTED)
   * Loud, bright, crystal-clear commercial POS confirmation chime.
   * Dual ascending note (1760Hz -> 2637Hz) with rich harmonic overtone and acoustic presence.
   */
  public playSuccessSound(eventKey?: string): boolean {
    if (!this.soundEnabled || this.volume <= 0) return false;
    if (this.shouldSuppressDuplicate(eventKey)) return false;

    try {
      const ctx = this.getContext();
      if (!ctx) return false;
      const now = ctx.currentTime;
      const out = this.getMasterOutput(ctx);

      const masterGain = ctx.createGain();
      const peak = Math.max(0.1, 0.92 * this.volume);
      masterGain.gain.setValueAtTime(peak, now);
      masterGain.connect(out);

      // --- Note 1: First bright chime (1760 Hz / A6) ---
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle'; // Richer presence than pure sine on mobile/laptop speakers
      osc1.frequency.setValueAtTime(1760, now);
      gain1.gain.setValueAtTime(0.75, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.085);

      // Sub-harmonic warmth for speaker cone punch
      const sub1 = ctx.createOscillator();
      const subGain1 = ctx.createGain();
      sub1.type = 'sine';
      sub1.frequency.setValueAtTime(880, now);
      subGain1.gain.setValueAtTime(0.45, now);
      subGain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      sub1.connect(subGain1);
      subGain1.connect(masterGain);
      sub1.start(now);
      sub1.stop(now + 0.085);

      // --- Note 2: Higher celebratory resolution chime (2637 Hz / E7) ---
      const note2Start = now + 0.065;
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2637, note2Start);
      gain2.gain.setValueAtTime(0.85, note2Start);
      gain2.gain.exponentialRampToValueAtTime(0.001, note2Start + 0.16);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(note2Start);
      osc2.stop(note2Start + 0.17);

      // Crystal shimmer layer on Note 2
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(3520, note2Start);
      shimmerGain.gain.setValueAtTime(0.35, note2Start);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, note2Start + 0.14);
      shimmer.connect(shimmerGain);
      shimmerGain.connect(masterGain);
      shimmer.start(note2Start);
      shimmer.stop(note2Start + 0.15);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sound 2 — Failed or rejected scan (REJECTED)
   * Loud, urgent, unmistakably distinct dual-pulse rejection buzzer ("BUZZ-BUZZ").
   * Detuned discordant sawtooth waves (160Hz + 178Hz) with sharp descending pitch that
   * contrast completely with the high melodic chime.
   */
  public playFailureSound(eventKey?: string): boolean {
    if (!this.soundEnabled || this.volume <= 0) return false;
    if (this.shouldSuppressDuplicate(eventKey)) return false;

    try {
      const ctx = this.getContext();
      if (!ctx) return false;
      const now = ctx.currentTime;
      const out = this.getMasterOutput(ctx);

      const masterGain = ctx.createGain();
      const peak = Math.max(0.1, 0.95 * this.volume);
      masterGain.gain.setValueAtTime(peak, now);
      masterGain.connect(out);

      // Two assertive, dissonant reject pulses: Pulse 1 at t=0, Pulse 2 at t=0.12s
      const pulses = [0, 0.12];
      pulses.forEach((pulseOffset) => {
        const pulseStart = now + pulseOffset;
        const pulseDuration = 0.095;

        // Primary harsh buzzer oscillator (sawtooth at 160Hz sliding down)
        const oscA = ctx.createOscillator();
        const gainA = ctx.createGain();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(160, pulseStart);
        oscA.frequency.linearRampToValueAtTime(130, pulseStart + pulseDuration);

        // Secondary detuned oscillator creating abrasive dissonance (178Hz sliding down)
        const oscB = ctx.createOscillator();
        const gainB = ctx.createGain();
        oscB.type = 'sawtooth';
        oscB.frequency.setValueAtTime(178, pulseStart);
        oscB.frequency.linearRampToValueAtTime(145, pulseStart + pulseDuration);

        // Low rumble for acoustic weight on speakers
        const subRumble = ctx.createOscillator();
        const subGain = ctx.createGain();
        subRumble.type = 'square';
        subRumble.frequency.setValueAtTime(95, pulseStart);

        gainA.gain.setValueAtTime(0.55, pulseStart);
        gainA.gain.exponentialRampToValueAtTime(0.01, pulseStart + pulseDuration);

        gainB.gain.setValueAtTime(0.45, pulseStart);
        gainB.gain.exponentialRampToValueAtTime(0.01, pulseStart + pulseDuration);

        subGain.gain.setValueAtTime(0.3, pulseStart);
        subGain.gain.exponentialRampToValueAtTime(0.01, pulseStart + pulseDuration);

        oscA.connect(gainA);
        oscB.connect(gainB);
        subRumble.connect(subGain);

        gainA.connect(masterGain);
        gainB.connect(masterGain);
        subGain.connect(masterGain);

        oscA.start(pulseStart);
        oscB.start(pulseStart);
        subRumble.start(pulseStart);

        oscA.stop(pulseStart + pulseDuration);
        oscB.stop(pulseStart + pulseDuration);
        subRumble.stop(pulseStart + pulseDuration);
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Legacy alias for Sound 1 (Successful scan)
   */
  public playSuccessBeep(eventKey?: string) {
    this.playSuccessSound(eventKey);
  }

  /**
   * Legacy alias for Sound 2 (Rejected scan)
   */
  public playDangerAlarm(eventKey?: string) {
    this.playFailureSound(eventKey);
  }

  /**
   * Ascending quick triple beep - Second plate added (1760Hz -> 2200Hz -> 2793Hz)
   */
  public playSecondPlateBeep() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const out = this.getMasterOutput(ctx);
      const peak = Math.max(0.1, 0.85 * this.volume);

      const notes = [1760, 2200, 2793];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.055;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(peak, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + 0.05);
        osc.connect(gain);
        gain.connect(out);
        osc.start(start);
        osc.stop(start + 0.055);
      });
    } catch {}
  }

  /**
   * Descending double tone - Undo scan (1050Hz -> 580Hz)
   */
  public playUndoBeep() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const out = this.getMasterOutput(ctx);
      const peak = Math.max(0.1, 0.80 * this.volume);

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1050, now);
      gain1.gain.setValueAtTime(peak, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
      osc1.connect(gain1);
      gain1.connect(out);
      osc1.start(now);
      osc1.stop(now + 0.075);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(580, now + 0.075);
      gain2.gain.setValueAtTime(peak * 0.9, now + 0.075);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc2.connect(gain2);
      gain2.connect(out);
      osc2.start(now + 0.075);
      osc2.stop(now + 0.165);
    } catch {}
  }

  /**
   * Repeat-in-window accepted scan routes to the unified success sound per scanner spec
   */
  public playWarningAlarm(eventKey?: string) {
    this.playSuccessSound(eventKey);
  }

  /**
   * Pleasant ascending notification chime (523Hz -> 784Hz) - In-app / system notification
   */
  public playNotificationChime() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const out = this.getMasterOutput(ctx);
      const peak = Math.max(0.05, 0.45 * this.volume);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.08); // G5

      gain.gain.setValueAtTime(peak, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(out);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }
}

export const sound = new AudioService();
