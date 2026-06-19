interface Props {
  name: string
  status: 'ok' | 'exceeded' | 'error'
  message: string
  mealOrdered?: number
  mealTaken?: number
  onDismiss: () => void
}

export default function ResultBanner({ name, status, message, mealOrdered, mealTaken, onDismiss }: Props) {
  const bg =
    status === 'ok' ? 'bg-green-600' :
    status === 'exceeded' ? 'bg-yellow-600' :
    'bg-red-700'

  const icon = status === 'ok' ? '✓' : status === 'exceeded' ? '⚠' : '✗'

  return (
    <div
      className={`${bg} rounded-xl p-4 flex flex-col gap-1 cursor-pointer active:opacity-80`}
      onClick={onDismiss}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{icon}</span>
        <span className="text-xl font-bold">{name}</span>
      </div>
      <p className="text-sm opacity-90">{message}</p>
      {mealOrdered !== undefined && (
        <p className="text-sm font-mono">
          {mealTaken} / {mealOrdered} 份已取 served
        </p>
      )}
      <p className="text-xs opacity-60 mt-1">点击继续 Tap to continue</p>
    </div>
  )
}
