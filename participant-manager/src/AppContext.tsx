import * as React from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './lib/db'
import { translate, type Lang, type TKey } from './lib/i18n'
import type { Project } from './lib/types'

// Lightweight preferences live in localStorage; everything else is in IndexedDB.
function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('pm.' + key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem('pm.' + key, typeof value === 'string' && key === 'theme' ? value : JSON.stringify(value))
  } catch {
    /* storage unavailable: preference simply isn't remembered */
  }
}

export type Route = 'dashboard' | 'projects' | 'import' | 'participants' | 'export' | 'settings'
const ROUTES: Route[] = ['dashboard', 'projects', 'import', 'participants', 'export', 'settings']

function routeFromHash(): Route {
  const h = location.hash.replace(/^#\/?/, '') as Route
  return ROUTES.includes(h) ? h : 'dashboard'
}

export type Density = 'comfortable' | 'compact'
export type Theme = 'dark' | 'light'

interface AppState {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
  theme: Theme
  setTheme: (t: Theme) => void
  density: Density
  setDensity: (d: Density) => void
  route: Route
  navigate: (r: Route) => void
  projects: Project[] | undefined
  activeProject: Project | undefined
  activeProjectId: string | null
  setActiveProjectId: (id: string | null) => void
  hiddenColumns: string[]
  setHiddenColumns: (c: string[]) => void
}

const Ctx = React.createContext<AppState | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => {
    const l = readPref<string>('lang', 'en')
    return l === 'es' ? 'es' : 'en'
  })
  const [theme, setThemeState] = React.useState<Theme>(() => {
    try {
      return localStorage.getItem('pm.theme') === 'light' ? 'light' : 'dark'
    } catch {
      return 'dark'
    }
  })
  const [density, setDensityState] = React.useState<Density>(() => readPref<Density>('density', 'comfortable'))
  const [route, setRoute] = React.useState<Route>(routeFromHash)
  const [activeProjectId, setActiveState] = React.useState<string | null>(() => readPref<string | null>('activeProject', null))
  const [hiddenColumns, setHiddenState] = React.useState<string[]>(() => readPref<string[]>('hiddenColumns', ['department', 'whatsapp', 'notes']))

  const projects = useLiveQuery(() => db.projects.toArray(), [])

  React.useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#081426' : '#eef2f7')
  }, [theme])

  React.useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Keep a valid active project: fall back to the first non-archived one.
  const activeProject = React.useMemo(() => {
    if (!projects) return undefined
    return projects.find((p) => p.id === activeProjectId)
  }, [projects, activeProjectId])

  React.useEffect(() => {
    if (!projects) return
    if (!activeProject && projects.length) {
      const first = [...projects].filter((p) => !p.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? projects[0]
      setActiveState(first.id)
      writePref('activeProject', first.id)
    }
  }, [projects, activeProject])

  const value: AppState = {
    lang,
    setLang: (l) => {
      setLangState(l)
      writePref('lang', l)
    },
    t: (key, vars) => translate(lang, key, vars),
    theme,
    setTheme: (t) => {
      setThemeState(t)
      writePref('theme', t)
    },
    density,
    setDensity: (d) => {
      setDensityState(d)
      writePref('density', d)
    },
    route,
    navigate: (r) => {
      if (location.hash !== '#/' + r) location.hash = '#/' + r
      setRoute(r)
      window.scrollTo({ top: 0 })
    },
    projects,
    activeProject,
    activeProjectId: activeProject?.id ?? null,
    setActiveProjectId: (id) => {
      setActiveState(id)
      writePref('activeProject', id)
    },
    hiddenColumns,
    setHiddenColumns: (c) => {
      setHiddenState(c)
      writePref('hiddenColumns', c)
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = React.useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}
