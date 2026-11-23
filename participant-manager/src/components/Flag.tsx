import { Globe2 } from 'lucide-react'
import { cn } from './ui/utils'

// Flag SVGs are bundled with the app (flag-icons, MIT) so they work offline and on Windows,
// which does not render emoji flags.
const FLAGS = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const byCode: Record<string, string> = {}
for (const [path, url] of Object.entries(FLAGS)) {
  const code = path.split('/').pop()!.replace('.svg', '').toUpperCase()
  byCode[code] = url
}

export function flagUrl(code: string): string | undefined {
  return code ? byCode[code.toUpperCase()] : undefined
}

export function Flag({ code, className }: { code: string; className?: string }) {
  const url = flagUrl(code)
  if (!url)
    return (
      <span className={cn('fi-img grid place-items-center bg-muted text-muted-foreground', className)} aria-hidden>
        <Globe2 className="size-3" />
      </span>
    )
  return <img src={url} alt="" aria-hidden className={cn('fi-img', className)} loading="lazy" decoding="async" />
}
