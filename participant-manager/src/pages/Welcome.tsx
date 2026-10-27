import { FileUp, ListChecks, Phone, Download, ShieldCheck, Sparkles, FolderPlus } from 'lucide-react'
import { useApp } from '@/AppContext'
import { Button } from '@/components/ui/button'
import { Globe } from '@/components/Globe'
import { setMeta } from '@/lib/db'
import { loadDemoData } from '@/lib/seed'

export default function Welcome() {
  const { t, setActiveProjectId, navigate } = useApp()
  const finish = async (demo: boolean) => {
    if (demo) {
      const id = await loadDemoData()
      setActiveProjectId(id)
      navigate('dashboard')
    } else {
      navigate('projects')
    }
    await setMeta('welcomeSeen', true)
  }
  const items = [
    { icon: FileUp, text: t('welcome1') },
    { icon: ListChecks, text: t('welcome2') },
    { icon: Phone, text: t('welcome3') },
    { icon: Download, text: t('welcome4') },
  ]
  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-6 md:grid-cols-[1.3fr_1fr] md:items-center">
      <div className="grid gap-5">
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t('welcomeTitle')}</h1>
        <p className="text-lg text-muted-foreground">{t('welcomeText')}</p>
        <ul className="grid gap-3">
          {items.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
                <Icon className="size-4" />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
          <p>{t('welcomePrivacy')}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="cta" size="lg" onClick={() => finish(true)}>
            <Sparkles /> {t('startDemo')}
          </Button>
          <Button variant="outline" size="lg" onClick={() => finish(false)}>
            <FolderPlus /> {t('startEmpty')}
          </Button>
        </div>
      </div>
      <div className="hidden md:block">
        <Globe className="mx-auto w-full max-w-xs drop-shadow-[0_0_40px_rgba(53,188,232,0.25)]" />
      </div>
    </div>
  )
}
