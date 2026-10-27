import * as React from 'react'
import * as M from '@radix-ui/react-dropdown-menu'
import { Check } from 'lucide-react'
import { cn } from './utils'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={6}
        align="end"
        className={cn(
          'z-50 max-h-[70dvh] min-w-48 overflow-y-auto rounded-xl border border-border bg-card p-1 text-sm text-foreground shadow-xl',
          className,
        )}
        {...props}
      />
    </M.Portal>
  )
}

export function MenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function MenuCheckItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      onSelect={(e) => e.preventDefault()}
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted',
        className,
      )}
      {...props}
    >
      <span className="grid size-4 place-items-center rounded border border-muted-foreground/60">
        <M.ItemIndicator>
          <Check className="size-3 text-accent" strokeWidth={3} />
        </M.ItemIndicator>
      </span>
      {children}
    </M.CheckboxItem>
  )
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground', className)} {...props} />
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />
}
