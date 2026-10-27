import * as React from 'react'
import { cn } from './utils'

const tones = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-accent/15 text-accent',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-destructive/15 text-destructive',
  success: 'bg-success/15 text-success',
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3', tones[tone], className)}
      {...props}
    />
  )
}
