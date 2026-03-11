import type { PointerEvent } from 'react'
import { pressButton, releaseButton, type DsButton } from '../lib/emulator'

interface ControlButtonProps {
  button: DsButton
  label: string
  accent?: 'primary' | 'secondary' | 'utility'
  className?: string
}

export function ControlButton({
  button,
  label,
  accent = 'utility',
  className = '',
}: ControlButtonProps) {
  const beginPress = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    pressButton(button)
  }

  const endPress = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    releaseButton(button)
  }

  return (
    <button
      className={`control-button ${accent} ${className}`.trim()}
      onPointerDown={beginPress}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      onPointerLeave={endPress}
    >
      <span>{label}</span>
    </button>
  )
}
