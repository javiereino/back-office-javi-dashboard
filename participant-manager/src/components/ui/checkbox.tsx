import * as React from 'react'
import * as C from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'
import { cn } from './utils'

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        'grid size-4 shrink-0 cursor-pointer place-items-center rounded border border-muted-foreground/60 bg-input data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent text-background',
        className,
      )}
      {...props}
    >
      <C.Indicator>
        {props.checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  )
}
