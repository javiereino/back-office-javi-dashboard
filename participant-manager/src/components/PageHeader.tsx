import * as React from 'react'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  text?: string
  children?: React.ReactNode
}) {
  return (
    <div className="panel grid place-items-center gap-3 px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
        <Icon className="size-7" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}
      {children && <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  )
}
