/**
 * Rock • Scissors • Paper • Well - Web Audio API Synthesizer Sound Service
 * Outputs robust, nostalgic 8-bit style synthesized sound effects purely in code.
 */

let audioCtx: AudioContext | null = null;

function isMuted(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('rspw_muted') === 'true';
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (isMuted()) return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  // Resume if suspended (browsers block autoplay until first user gesture)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch((err) => console.warn("Failed to resume AudioContext", err));
  }
  return audioCtx;
}

/**
 * Play a light, crisp tactile tap/click sound.
 * Perfect for selecting options, navigating tabs, and button presses.
 */
export function playClickSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;


  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'triangle';
  // Fast frequency sweep down from 800Hz to 200Hz for a juicy pop/click sound
  osc.frequency.setValueAtTime(800, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);

  // Fast volume envelope decay
  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.09);
}

/**
 * Play a beautiful, triumphant major triad win chime.
 */
export function playWinChime() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const playNote = (freq: number, startDelay: number, duration: number, volume = 0.1) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);

    // Combine a sine wave with a little triangle to give a melodic chip sound
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startDelay);

    gain.gain.setValueAtTime(0.01, ctx.currentTime + startDelay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startDelay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startDelay + duration);

    osc.start(ctx.currentTime + startDelay);
    osc.stop(ctx.currentTime + startDelay + duration + 0.05);
  };

  // C major triad (C5 -> E5 -> G5 -> C6)
  const duration = 0.45;
  playNote(523.25, 0.00, duration);      // C5
  playNote(659.25, 0.08, duration);      // E5
  playNote(783.99, 0.16, duration);      // G5
  playNote(1046.50, 0.24, duration + 0.2, 0.12); // C6
}

/**
 * Play a light, playful tone for game events.
 */
export function playMatchmakingPing() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
  osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5

  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/**
 * Play a gentle warning/loss transition sound.
 */
export function playDefeatSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;


  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sawtooth';
  
  // Downward melancholy glide
  osc.frequency.setValueAtTime(293.66, ctx.currentTime); // D4
  osc.frequency.linearRampToValueAtTime(196.00, ctx.currentTime + 0.4); // G3

  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}
