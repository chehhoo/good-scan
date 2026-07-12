/// <reference types="vite/client" />

declare const __APP_VERSION__: string

// Web Speech API (not yet in lib.dom.d.ts everywhere)
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognition extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
declare var SpeechRecognition: { new(): SpeechRecognition }
interface Window {
  SpeechRecognition?: typeof SpeechRecognition
  webkitSpeechRecognition?: typeof SpeechRecognition
}
