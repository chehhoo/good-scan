import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'

interface Props {
  onScan: (result: string) => void
  active: boolean
}

export default function QrScanner({ onScan, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      readerRef.current?.reset()
      return
    }

    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromVideoDevice(null, videoRef.current!, (result, err) => {
      if (result) {
        onScan(result.getText())
      } else if (err && err.name !== 'NotFoundException') {
        setError('Camera error: ' + err.message)
      }
    }).catch((e) => setError('Camera access denied: ' + e.message))

    return () => {
      reader.reset()
    }
  }, [active, onScan])

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-900 rounded-xl text-red-400 text-sm p-4 text-center">
        {error}
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video ref={videoRef} className="w-full aspect-square object-cover" muted playsInline />
      {/* Scan overlay — corner brackets */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 relative">
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos, i) => (
            <span
              key={i}
              className={`absolute w-8 h-8 border-white border-4 ${pos} ${
                i < 2 ? 'border-b-0' : 'border-t-0'
              } ${i % 2 === 0 ? 'border-r-0' : 'border-l-0'}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
