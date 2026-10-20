import { Check, Copy } from 'lucide-react'
import type * as React from 'react'
import { useState } from 'react'
import { Button } from '@/ui/button'
import { SwapLabel } from '@/ui/swap-label'

/** How long a copy control says Copied. */
export const COPIED_MS = 2000

/**
 * Clipboard control used by code wells and adopt CTAs. Writes `text`, swaps the
 * label to Copied on success, and calls `onCopied` only after a successful write
 * so callers can record analytics without duplicating clipboard logic.
 */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  size = 'sm',
  variant = 'outline',
  iconOnly = false,
  ariaLabel,
  onCopied,
}: {
  text: string
  label?: string | undefined
  copiedLabel?: string | undefined
  /** `pill`: the redesign's install button, its icon trailing in its own circle. */
  size?: 'sm' | 'lg' | 'icon-sm' | 'pill' | undefined
  variant?: 'outline' | 'ghost' | 'default' | undefined
  iconOnly?: boolean | undefined
  ariaLabel?: string | undefined
  onCopied?: (() => void) | undefined
}) {
  const [copied, setCopied] = useState(false)
  const name = copied ? copiedLabel : label

  function handleClick() {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), COPIED_MS)
        onCopied?.()
      })
      .catch(() => {
        // Clipboard denied/unavailable — don't claim Copied.
      })
  }

  const icon = copied ? <Check /> : <Copy />
  if (size === 'pill' && !iconOnly)
    return (
      <Button
        type="button"
        variant={variant}
        size="pill"
        trailingIcon={icon}
        onClick={handleClick}
        aria-label={copied ? copiedLabel : (ariaLabel ?? name)}
      >
        <SwapLabel label={label} swapped={copied} swappedLabel={copiedLabel} />
      </Button>
    )
  return (
    <Button
      type="button"
      variant={variant}
      size={iconOnly || size === 'pill' ? 'icon-sm' : size}
      onClick={handleClick}
      aria-label={copied ? copiedLabel : (ariaLabel ?? name)}
    >
      {icon}
      {iconOnly ? null : <SwapLabel label={label} swapped={copied} swappedLabel={copiedLabel} />}
    </Button>
  )
}

/** Positions an icon copy control over a sunken code well. */
export function Copyable({
  text,
  copyLabel = 'Copy',
  onCopied,
  children,
}: {
  text?: string | undefined
  copyLabel?: string | undefined
  onCopied?: (() => void) | undefined
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      {children}
      {text !== undefined ? (
        <div className="absolute top-2 right-2 z-10">
          <CopyButton iconOnly text={text} label={copyLabel} onCopied={onCopied} />
        </div>
      ) : null}
    </div>
  )
}
