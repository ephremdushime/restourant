/**
 * RestoPass Central Scanner & POS Sound Service (Web Audio API)
 * Provides two distinct, unmistakable scanner station sounds:
 *  - Sound 1: playSuccessSound() — Short, bright confirmation tone after a meal deduction succeeds.
 *  - Sound 2: playFailureSound() — Distinct, lower-pitched warning tone whenever a scan is rejected.
 * Includes volume control, preloading, browser autoplay unlock detection, and event deduplication.
 */

class AudioService {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private volume = 0.85; // 0.0 to 1.0 (default 85% for busy canteen environments)
  private audioUnlocked = false;
  private lastPlayedEventKey: string | null = null;
  private lastPlayedTimestamp = 0;

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
      if (this.lastPlayedEventKey === eventKey) {
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
   * One short, bright, clearly audible confirmation tone played ONLY after meal deduction succeeds.
   * Identical for both physical card and dashboard QR scans.
   */
  public playSuccessSound(eventKey?: string): boolean {
    if (!this.soundEnabled || this.volume <= 0) return false;
    if (this.shouldSuppressDuplicate(eventKey)) return false;

    try {
      const ctx = this.getContext();
      if (!ctx) return false;
      const now = ctx.currentTime;
      const peakGain = Math.max(0.05, 0.38 * this.volume);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Bright, unmistakable high-clarity acceptance tone (1850Hz -> 2150Hz)
      osc.frequency.setValueAtTime(1850, now);
      osc.frequency.setValueAtTime(2150, now + 0.045);

      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sound 2 — Failed or rejected scan (REJECTED)
   * One distinct, lower-pitched, unmistakable warning tone played once whenever a scan is rejected.
   */
  public playFailureSound(eventKey?: string): boolean {
    if (!this.soundEnabled || this.volume <= 0) return false;
    if (this.shouldSuppressDuplicate(eventKey)) return false;

    try {
      const ctx = this.getContext();
      if (!ctx) return false;
      const now = ctx.currentTime;
      const peakGain = Math.max(0.05, 0.42 * this.volume);

      // Low-pitched sawtooth warning buzzer (260Hz -> 195Hz)
      [0, 0.15].forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(idx === 0 ? 260 : 195, now + delay);
        gain.gain.setValueAtTime(peakGain, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.008, now + delay + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
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
   * Ascending quick double beep - Second plate added
   */
  public playSecondPlateBeep() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const peakGain = Math.max(0.05, 0.32 * this.volume);

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(1700, now);
      gain1.gain.setValueAtTime(peakGain, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.06);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(2300, now + 0.08);
      gain2.gain.setValueAtTime(peakGain, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.16);
    } catch {}
  }

  /**
   * Descending double tone - Undo scan
   */
  public playUndoBeep() {
    if (!this.soundEnabled || this.volume <= 0) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const peakGain = Math.max(0.05, 0.28 * this.volume);

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(1200, now);
      gain1.gain.setValueAtTime(peakGain, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(750, now + 0.09);
      gain2.gain.setValueAtTime(peakGain, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.18);
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
      const peakGain = Math.max(0.05, 0.25 * this.volume);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(783.99, now + 0.08); // G5

      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  }
}

export const sound = new AudioService();
