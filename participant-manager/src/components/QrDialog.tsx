import * as React from 'react'
import { useApp } from '@/AppContext'
import { Dialog, DialogContent } from './ui/dialog'

export function QrDialog({ open, onOpenChange, name, text }: { open: boolean; onOpenChange: (o: boolean) => void; name: string; text: string }) {
  const { t } = useApp()
  const [url, setUrl] = React.useState<string>('')
  React.useEffect(() => {
    if (!open) return
    let alive = true
    import('qrcode').then((QR) =>
      QR.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 320, color: { dark: '#081426', light: '#ffffff' } }).then(
        (u) => alive && setUrl(u),
      ),
    )
    return () => {
      alive = false
    }
  }, [open, text])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('qrTitle', { name })} description={t('qrText')}>
        <div className="grid place-items-center py-2">
          {url ? (
            <img src={url} alt={t('qrTitle', { name })} className="size-72 rounded-xl bg-white p-2" />
          ) : (
            <div className="size-72 animate-pulse rounded-xl bg-muted" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
