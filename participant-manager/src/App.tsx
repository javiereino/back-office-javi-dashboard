import * as React from 'react'
import { Toaster } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  LayoutDashboard,
  FolderKanban,
  FileUp,
  Users,
  HardDriveDownload,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Menu as MenuIcon,
  X,
  ShieldCheck,
} from 'lucide-react'
import { AppProvider, useApp, type Route } from './AppContext'
import { TooltipProvider } from './components/ui/tooltip'
import { ConfirmProvider } from './components/ui/confirm'
import { cn } from './components/ui/utils'
import { Globe } from './components/Globe'
import { getMeta } from './lib/db'
import type { TKey } from './lib/i18n'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ImportPage from './pages/Import'
import Participants from './pages/Participants'
import ExportPage from './pages/Export'
import SettingsPage from './pages/Settings'
import Welcome from './pages/Welcome'

const NAV: { route: Route; label: TKey; icon: React.ComponentType<{ className?: string }> }[] = [
  { route: 'dashboard', label: 'navDashboard', icon: LayoutDashboard },
  { route: 'projects', label: 'navProjects', icon: FolderKanban },
  { route: 'import', label: 'navImport', icon: FileUp },
  { route: 'participants', label: 'navParticipants', icon: Users },
  { route: 'export', label: 'navExport', icon: HardDriveDownload },
  { route: 'settings', label: 'navSettings', icon: SettingsIcon },
]

function Brand() {
  const { t } = useApp()
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-[#1452b5] to-[#35BCE8] text-white shadow-[0_0_18px_-4px_#35BCE8]">
        <Users className="size-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[15px] font-bold text-white">{t('appName')}</div>
        <div className="truncate text-[11px] text-sidebar-foreground/70">{t('appTagline')}</div>
      </div>
    </div>
  )
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t, route, navigate } = useApp()
  return (
    <nav className="grid gap-1" aria-label="Main">
      {NAV.map(({ route: r, label, icon: Icon }) => {
        const active = r === route
        return (
          <a
            key={r}
            href={`#/${r}`}
            onClick={(e) => {
              e.preventDefault()
              navigate(r)
              onNavigate?.()
            }}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-gradient-to-r from-sidebar-active to-sidebar-active/60 text-white shadow-[inset_0_0_0_1px_rgba(53,188,232,0.35)]'
                : 'text-sidebar-foreground hover:bg-white/5 hover:text-white',
            )}
          >
            <Icon className={cn('size-[18px]', active ? 'text-[#7fd8f5]' : 'text-sidebar-foreground/70')} />
            {t(label)}
          </a>
        )
      })}
    </nav>
  )
}

function SidebarFooter() {
  const { t } = useApp()
  return (
    <div className="relative mt-auto overflow-hidden rounded-xl px-2 pb-1 pt-4">
      <Globe className="mx-auto -mb-6 w-40 opacity-90" />
      <div className="relative flex items-center gap-2 px-1">
        <ShieldCheck className="size-4 shrink-0 text-[#35BCE8]" />
        <div className="text-[11px] font-bold uppercase leading-tight tracking-[0.14em] text-[#9fdcf2]">
          Participant
          <br />
          Manager AI
        </div>
      </div>
      <p className="relative mt-2 px-1 text-[11px] leading-snug text-sidebar-foreground/60">{t('localOnly')}</p>
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-white/5 bg-gradient-to-b from-sidebar-2 to-sidebar px-3 py-5 lg:flex">
      <Brand />
      <SidebarNav />
      <SidebarFooter />
    </aside>
  )
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp()
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t('menu')}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-gradient-to-b from-sidebar-2 to-sidebar px-3 py-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <Brand />
          <button className="rounded-md p-2 text-sidebar-foreground hover:bg-white/10" onClick={onClose} aria-label={t('close')}>
            <X className="size-5" />
          </button>
        </div>
        <SidebarNav onNavigate={onClose} />
        <SidebarFooter />
      </aside>
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t, lang, setLang, theme, setTheme, projects, activeProjectId, setActiveProjectId } = useApp()
  const visible = (projects ?? []).filter((p) => !p.archived || p.id === activeProjectId)
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-2 px-4 py-3 sm:gap-3 lg:px-8">
        <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={onMenu} aria-label={t('menu')}>
          <MenuIcon className="size-5" />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="active-project" className="hidden text-xs font-semibold uppercase tracking-wider text-muted-foreground md:block">
            {t('activeProject')}
          </label>
          <select
            id="active-project"
            className="h-9 min-w-0 max-w-[26rem] flex-1 cursor-pointer truncate rounded-lg border border-border bg-input px-3 text-sm font-semibold"
            value={activeProjectId ?? ''}
            onChange={(e) => setActiveProjectId(e.target.value || null)}
          >
            {!visible.length && <option value="">{t('noProject')}</option>}
            {[...visible]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.archived ? ` (${t('archived')})` : ''}
                </option>
              ))}
          </select>
        </div>
        <div className="flex items-center rounded-lg border border-border p-0.5" role="group" aria-label={t('language')}>
          {(['en', 'es'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              aria-label={l === 'en' ? 'English' : 'Español'}
              lang={l}
              className={cn(
                'rounded-md px-2 py-1 text-xs font-bold uppercase',
                lang === l ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          title={theme === 'dark' ? t('themeLight') : t('themeDark')}
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  )
}

function Shell() {
  const { route, theme } = useApp()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const welcomeSeen = useLiveQuery(() => getMeta<boolean>('welcomeSeen').then((v) => v ?? false), [])
  const Page = {
    dashboard: Dashboard,
    projects: Projects,
    import: ImportPage,
    participants: Participants,
    export: ExportPage,
    settings: SettingsPage,
  }[route]

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 lg:px-8">
          {welcomeSeen === false ? <Welcome /> : welcomeSeen === undefined ? null : <Page />}
        </main>
      </div>
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <ConfirmProvider>
          <Shell />
        </ConfirmProvider>
      </TooltipProvider>
    </AppProvider>
  )
}
