/**
 * Rock • Scissors • Paper • Well - Advanced Web Audio API Synthesizer Sound Service
 * Outputs robust, modern, deep, high-fidelity audio feedback purely coded in Web Audio.
 * 0 KB payload size, zero network lag, instant mobile execution.
 */

let audioCtx: AudioContext | null = null;

export function isMuted(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem('rspw_muted') === 'true';
}

export function toggleMute(): boolean {
  if (typeof window === 'undefined') return false;
  const current = isMuted();
  localStorage.setItem('rspw_muted', current ? 'false' : 'true');
  return !current;
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
 * Creates a beautiful stereo-like ping with slight frequency modulation and resonant filter
 */
function playSynthTone(options: {
  freqs: number[];
  durations: number[];
  type: OscillatorType;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  filterQ?: number;
  gainStart: number;
  gainEnd: number;
  sweepFreqTo?: number;
  delayMs?: number;
}) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const delay = (options.delayMs || 0) / 1000;
  const startTime = ctx.currentTime + delay;

  // Master Gain of the tone
  const masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);
  
  // Resonant Filter
  const filter = ctx.createBiquadFilter();
  filter.type = options.filterType || 'lowpass';
  filter.frequency.setValueAtTime(options.filterFreq || 2000, startTime);
  if (options.filterQ) {
    filter.Q.setValueAtTime(options.filterQ, startTime);
  }
  filter.connect(masterGain);

  let longestDuration = 0;

  options.freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();

    osc.type = options.type;
    osc.frequency.setValueAtTime(freq, startTime);

    const dur = options.durations[idx] || options.durations[0] || 0.2;
    if (dur > longestDuration) {
      longestDuration = dur;
    }

    if (options.sweepFreqTo) {
      osc.frequency.exponentialRampToValueAtTime(options.sweepFreqTo, startTime + dur);
    }

    // Snippy volume response
    oscGain.gain.setValueAtTime(0.001, startTime);
    oscGain.gain.linearRampToValueAtTime(options.gainStart, startTime + 0.015);
    oscGain.gain.exponentialRampToValueAtTime(options.gainEnd, startTime + dur);

    osc.connect(oscGain);
    oscGain.connect(filter);

    osc.start(startTime);
    osc.stop(startTime + dur + 0.05);
  });

  // Global decay rampdown to zero strictly
  masterGain.gain.setValueAtTime(1, startTime);
  masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + longestDuration);
}

/**
 * 1. Move Selection Sound
 * Short, crisp, tactile UI pop. Perfect for move highlights.
 */
export function playClickSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Dual tone high frequency click
  playSynthTone({
    freqs: [620, 880],
    durations: [0.06],
    type: 'sine',
    filterFreq: 3000,
    gainStart: 0.18,
    gainEnd: 0.001,
    sweepFreqTo: 350
  });
}

/**
 * 2. Match Found Notification
 * Exciting sci-fi arpeggiated sound to create game anticipation.
 */
export function playMatchFoundSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Rapid ascending 4-note tech chime arpeggio
  const baseChime = [349.23, 440.00, 523.25, 659.25]; // F4, A4, C5, E5 (F Major 7th)
  baseChime.forEach((note, index) => {
    playSynthTone({
      freqs: [note, note * 1.5],
      durations: [0.24],
      type: 'sine',
      filterType: 'peaking',
      filterFreq: 1800,
      filterQ: 3,
      gainStart: 0.14,
      gainEnd: 0.002,
      delayMs: index * 60
    });
  });

  // Extra rich sub drop and bell ring to ground the matched battle state
  playSynthTone({
    freqs: [110, 880],
    durations: [0.45],
    type: 'triangle',
    filterFreq: 1200,
    gainStart: 0.22,
    gainEnd: 0.001,
    sweepFreqTo: 55,
    delayMs: 240
  });
}

/**
 * Alias to support original matchmaking ping hook correctly.
 */
export function playMatchmakingPing() {
  playMatchFoundSound();
}

/**
 * 3. Countdown PiP Tone
 * Clear, punchy pip sound; makes competitive rounds feel energetic.
 * @param isGo If true, plays a higher, louder buzz to declare round action start!
 */
export function playCountdownSound(isGo: boolean = false) {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  if (isGo) {
    // Powerful, action starter tone (C6 + C5 combo, sweeping)
    playSynthTone({
      freqs: [523.25, 1046.50],
      durations: [0.4],
      type: 'triangle',
      filterFreq: 2800,
      gainStart: 0.26,
      gainEnd: 0.001,
      sweepFreqTo: 800
    });
  } else {
    // Sharp, metallic countdown note (A5)
    playSynthTone({
      freqs: [880],
      durations: [0.15],
      type: 'sine',
      filterFreq: 4000,
      gainStart: 0.2,
      gainEnd: 0.001
    });
  }
}

/**
 * 4. Battle Round Start Clash
 * Powerful, energetic "battle start" clash effect.
 */
export function playRoundStartSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Deep booming synthesizer gong (combines very low frequency sawtooth with FM)
  playSynthTone({
    freqs: [80, 120, 240],
    durations: [0.6],
    type: 'sawtooth',
    filterFreq: 450,
    filterQ: 4,
    gainStart: 0.28,
    gainEnd: 0.001,
    sweepFreqTo: 40
  });

  // High metallic impact hiss
  playSynthTone({
    freqs: [1800, 3200],
    durations: [0.25],
    type: 'triangle',
    filterFreq: 3500,
    gainStart: 0.16,
    gainEnd: 0.001
  });
}

/**
 * 5. satisfying, rewarding, energetic Victory (Win) sound
 * Beautiful, triumphal major 9th progression cascade arpeggio with delay.
 */
export function playWinChime() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Glorious chords progression (C5 -> E5 -> G5 -> B5 -> C6)
  const duration = 0.55;
  const notes = [523.25, 659.25, 783.99, 987.77, 1046.50];
  
  notes.forEach((freq, idx) => {
    playSynthTone({
      freqs: [freq, freq * 1.005], // subtle tuning detune for a rich chorus effect
      durations: [duration + idx * 0.05],
      type: 'sine',
      filterType: 'peaking',
      filterFreq: 2200,
      gainStart: idx === notes.length - 1 ? 0.24 : 0.16,
      gainEnd: 0.001,
      delayMs: idx * 75
    });
  });

  // Adding sparkling high-end sweep after a short lag
  playSynthTone({
    freqs: [1318.51, 1567.98, 2093.00], // E6, G6, C7
    durations: [0.7],
    type: 'sine',
    filterFreq: 5000,
    gainStart: 0.12,
    gainEnd: 0.001,
    delayMs: 380
  });
}

/**
 * Alias to satisfy alternative calls
 */
export function playVictorySound() {
  playWinChime();
}

/**
 * 6. Soft, Respectful Defeat Sound
 * Melodic, melancholy minor-major drop with an analogue-feeling low-pass sweep.
 */
export function playDefeatSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Descending minor chord (A4 -> F4 -> D4 -> G2)
  const notes = [440.00, 349.23, 293.66, 98.00];
  notes.forEach((freq, idx) => {
    playSynthTone({
      freqs: [freq],
      durations: [0.5 - idx * 0.05],
      type: 'triangle',
      filterFreq: 700,
      gainStart: 0.18,
      gainEnd: 0.001,
      delayMs: idx * 110,
      sweepFreqTo: freq * 0.82
    });
  });
}

/**
 * 7. Draw Sound effect
 * Neutral harmonic tone for tie rounds.
 */
export function playDrawSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Unison perfect fourth intervals (A4 & D5) stable and plain
  playSynthTone({
    freqs: [440.00, 587.33],
    durations: [0.45],
    type: 'sine',
    filterFreq: 1200,
    gainStart: 0.18,
    gainEnd: 0.001
  });
}

/**
 * 8. Referral Registration Sound
 * Uplifting coin collect arpeggio to make friend acquisition rewarding.
 */
export function playReferralSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Classic high double-bounce coin chime (E5 -> B5, rapid)
  playSynthTone({
    freqs: [659.25], // E5
    durations: [0.12],
    type: 'sine',
    filterFreq: 3000,
    gainStart: 0.16,
    gainEnd: 0.001
  });

  playSynthTone({
    freqs: [987.77], // B5
    durations: [0.35],
    type: 'sine',
    filterFreq: 3000,
    gainStart: 0.22,
    gainEnd: 0.001,
    delayMs: 70
  });
}

/**
 * 9. Wallet Connected Sound
 * Futuristic matrix ascending tech chime representing blockchain connection hook.
 */
export function playWalletConnectSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // High fast spacey rising sweep
  playSynthTone({
    freqs: [370, 740, 1480], // detuned F# octave stack
    durations: [0.5],
    type: 'sine',
    filterType: 'highpass',
    filterFreq: 1000,
    gainStart: 0.18,
    gainEnd: 0.001,
    sweepFreqTo: 2200
  });
}

/**
 * 10. Achievement or Streak XP Claim Sound
 * Magical glittering gold reward sound effect.
 */
export function playRewardXPSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Sparkling waterfall cascade
  const scale = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C pentatonic
  scale.forEach((freq, idx) => {
    playSynthTone({
      freqs: [freq, freq * 1.5],
      durations: [0.3],
      type: 'sine',
      filterFreq: 4000,
      gainStart: 0.12,
      gainEnd: 0.002,
      delayMs: idx * 45
    });
  });
}

/**
 * 11. Notification Sound
 * Gentle high-quality system notice ping.
 */
export function playNotificationSound() {
  if (isMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Soft high warm slide ping
  playSynthTone({
    freqs: [784.0],
    durations: [0.25],
    type: 'sine',
    filterFreq: 2500,
    gainStart: 0.15,
    gainEnd: 0.001,
    sweepFreqTo: 950
  });
}
