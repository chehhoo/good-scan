let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function beep(freq: number, duration: number, type: OscillatorType, gain: number, startTime: number): void {
  const ac = getCtx()
  const osc = ac.createOscillator()
  const env = ac.createGain()
  osc.connect(env)
  env.connect(ac.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, startTime)
  env.gain.setValueAtTime(0, startTime)
  env.gain.linearRampToValueAtTime(gain, startTime + 0.01)
  env.gain.linearRampToValueAtTime(0, startTime + duration)
  osc.start(startTime)
  osc.stop(startTime + duration + 0.01)
}

/** Two rising tones — pleasant chime for a successful scan */
export function playSuccess(): void {
  const ac = getCtx()
  const now = ac.currentTime
  beep(523, 0.12, 'sine', 0.4, now)          // C5
  beep(784, 0.18, 'sine', 0.35, now + 0.11)  // G5
}

/** Descending harsh tones — quota exceeded */
export function playExceeded(): void {
  const ac = getCtx()
  const now = ac.currentTime
  beep(330, 0.14, 'sawtooth', 0.25, now)         // E4
  beep(220, 0.20, 'sawtooth', 0.22, now + 0.13)  // A3
}

/** Single flat low buzz — error (not found, system error) */
export function playError(): void {
  const ac = getCtx()
  const now = ac.currentTime
  beep(180, 0.30, 'square', 0.20, now)
}
