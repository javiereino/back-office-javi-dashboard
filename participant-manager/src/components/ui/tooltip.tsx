import * as React from 'react'
import * as T from '@radix-ui/react-tooltip'

export const TooltipProvider = T.Provider

export function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={6}
          className="z-50 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-lg"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
