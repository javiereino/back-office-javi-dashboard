import { AlertTriangle } from 'lucide-react'
import { useApp } from '@/AppContext'

export function StorageWarning() {
  const { t } = useApp()
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
      <p>{t('storageWarning')}</p>
    </div>
  )
}
