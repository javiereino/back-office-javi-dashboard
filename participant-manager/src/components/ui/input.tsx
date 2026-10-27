import * as React from 'react'
import { cn } from './utils'

export const inputClass =
  'h-10 w-full min-w-0 rounded-lg border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, className)} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(inputClass, 'pr-8 cursor-pointer', className)} {...props}>
      {children}
    </select>
  ),
)
Select.displayName = 'Select'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-xs font-semibold uppercase tracking-wider text-muted-foreground', className)} {...props} />
}
