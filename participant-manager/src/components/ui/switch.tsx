import * as React from 'react'
import * as S from '@radix-ui/react-switch'
import { cn } from './utils'

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        'relative h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border bg-muted transition-colors data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.3rem]" />
    </S.Root>
  )
}
