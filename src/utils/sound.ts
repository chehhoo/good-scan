let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function schedule(ac: AudioContext, freq: number, duration: number, type: OscillatorType, gain: number, startTime: number): void {
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

// Mobile Chrome creates AudioContext in 'suspended' state; resume() is needed
// before reading currentTime so oscillators play at the correct moment.
async function play(notes: Array<[number, number, OscillatorType, number, number]>): Promise<void> {
  const ac = getCtx()
  if (ac.state === 'suspended') await ac.resume()
  const now = ac.currentTime
  for (const [freq, duration, type, gain, offset] of notes) {
    schedule(ac, freq, duration, type, gain, now + offset)
  }
}

/** Two rising tones — pleasant chime for a successful scan */
export function playSuccess(): void {
  void play([
    [523, 0.12, 'sine', 0.4, 0],
    [784, 0.18, 'sine', 0.35, 0.11],
  ])
}

/** Descending harsh tones — quota exceeded */
export function playExceeded(): void {
  void play([
    [330, 0.14, 'sawtooth', 0.25, 0],
    [220, 0.20, 'sawtooth', 0.22, 0.13],
  ])
}

/** Single flat low buzz — error (not found, system error) */
export function playError(): void {
  void play([
    [180, 0.30, 'square', 0.20, 0],
  ])
}
