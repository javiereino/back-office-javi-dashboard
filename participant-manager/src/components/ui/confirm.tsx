import * as React from 'react'
import * as A from '@radix-ui/react-alert-dialog'
import { AlertTriangle } from 'lucide-react'
import { Button } from './button'
import { Input } from './input'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  /** When set, the user must type this exact text to enable the confirm button. */
  typeToConfirm?: string
  typeToConfirmLabel?: string
}

type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>
const Ctx = React.createContext<ConfirmFn>(async () => false)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const [typed, setTyped] = React.useState('')
  const confirm = React.useCallback<ConfirmFn>(
    (o) =>
      new Promise((resolve) => {
        setTyped('')
        setState({ ...o, resolve })
      }),
    [],
  )
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  const blocked = !!state?.typeToConfirm && typed.trim() !== state.typeToConfirm
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <A.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <A.Portal>
          <A.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <A.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground shadow-2xl">
            <div className="flex gap-3">
              {state?.destructive && (
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
                  <AlertTriangle className="size-5" />
                </div>
              )}
              <div className="min-w-0">
                <A.Title className="text-lg font-semibold">{state?.title}</A.Title>
                <A.Description asChild>
                  <div className="mt-1 text-sm text-muted-foreground">{state?.description}</div>
                </A.Description>
              </div>
            </div>
            {state?.typeToConfirm && (
              <div className="mt-4 grid gap-1.5">
                <label htmlFor="confirm-type" className="text-sm text-muted-foreground">
                  {state.typeToConfirmLabel}
                </label>
                <Input id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <A.Cancel asChild>
                <Button variant="outline">{state?.cancelLabel}</Button>
              </A.Cancel>
              <Button
                variant={state?.destructive ? 'destructive' : 'default'}
                disabled={blocked}
                onClick={() => close(true)}
              >
                {state?.confirmLabel}
              </Button>
            </div>
          </A.Content>
        </A.Portal>
      </A.Root>
    </Ctx.Provider>
  )
}

export const useConfirm = () => React.useContext(Ctx)
