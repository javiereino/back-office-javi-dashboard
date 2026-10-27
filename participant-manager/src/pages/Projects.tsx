import * as React from 'react'
import { toast } from 'sonner'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, MapPin, CalendarDays, MoreVertical, Pencil, Copy, Archive, ArchiveRestore, Trash2, FolderOpen, FolderKanban, CheckCircle2 } from 'lucide-react'
import { useApp } from '@/AppContext'
import { PageHeader, EmptyState } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input, Label, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/dropdown'
import { useConfirm } from '@/components/ui/confirm'
import { cn } from '@/components/ui/utils'
import { createProject, db, deleteProject, duplicateProject, updateProject } from '@/lib/db'
import { cleanLine, cleanMultiline } from '@/lib/text'
import type { Project } from '@/lib/types'

function ProjectDialog({ open, onOpenChange, project }: { open: boolean; onOpenChange: (o: boolean) => void; project?: Project }) {
  const { t, setActiveProjectId } = useApp()
  const [form, setForm] = React.useState({ name: '', location: '', startDate: '', endDate: '', description: '', customFields: '' })
  const [error, setError] = React.useState('')
  React.useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      project
        ? { ...project, customFields: project.customFields.join('\n') }
        : { name: '', location: '', startDate: '', endDate: '', description: '', customFields: '' },
    )
  }, [open, project])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = cleanLine(form.name, 150)
    if (!name) return setError(t('nameRequired'))
    if (form.startDate && form.endDate && form.endDate < form.startDate) return setError(t('datesInvalid'))
    const data = {
      name,
      location: cleanLine(form.location, 150),
      startDate: form.startDate,
      endDate: form.endDate,
      description: cleanMultiline(form.description, 2000),
      customFields: [...new Set(form.customFields.split('\n').map((s) => cleanLine(s, 60)).filter(Boolean))],
    }
    if (project) {
      await updateProject(project.id, data)
      toast.success(t('saved'))
    } else {
      const p = await createProject(data)
      setActiveProjectId(p.id)
      toast.success(t('projectCreated'))
    }
    onOpenChange(false)
  }
  const bind = (k: keyof typeof form) => ({
    id: `prj-${k}`,
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value })),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? t('editProject') : t('newProject')}>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="prj-name">{t('projectName')}</Label>
            <Input {...bind('name')} required autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prj-location">{t('location')}</Label>
            <Input {...bind('location')} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="prj-startDate">{t('startDate')}</Label>
              <Input type="date" {...bind('startDate')} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="prj-endDate">{t('endDate')}</Label>
              <Input type="date" {...bind('endDate')} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prj-description">{t('description')}</Label>
            <Textarea {...bind('description')} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prj-customFields">{t('customFields')}</Label>
            <Textarea {...bind('customFields')} rows={2} />
            <p className="text-xs text-muted-foreground">{t('customFieldsHelp')}</p>
          </div>
          {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit">{project ? t('saveChanges') : t('create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function Projects() {
  const { t, lang, projects, activeProjectId, setActiveProjectId, navigate } = useApp()
  const confirm = useConfirm()
  const [dialog, setDialog] = React.useState<{ open: boolean; project?: Project }>({ open: false })
  const [showArchived, setShowArchived] = React.useState(false)
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    await db.participants.each((p) => m.set(p.projectId, (m.get(p.projectId) ?? 0) + 1))
    return m
  }, [])

  const list = (projects ?? [])
    .filter((p) => showArchived || !p.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || b.updatedAt - a.updatedAt)
  const archivedCount = (projects ?? []).filter((p) => p.archived).length

  const fmt = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

  const remove = async (p: Project) => {
    const n = counts?.get(p.id) ?? 0
    const ok = await confirm({
      title: t('deleteProjectTitle', { name: p.name }),
      description: t('deleteProjectText', { n }),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      destructive: true,
      typeToConfirm: n > 0 ? p.name : undefined,
      typeToConfirmLabel: t('typeNameToConfirm'),
    })
    if (!ok) return
    await deleteProject(p.id)
    if (p.id === activeProjectId) setActiveProjectId(null)
    toast.success(t('projectDeleted'))
  }

  const open = (p: Project) => {
    setActiveProjectId(p.id)
    navigate('participants')
  }

  return (
    <div>
      <PageHeader
        title={t('projectsTitle')}
        subtitle={t('projectsSubtitle')}
        actions={
          <>
            {archivedCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} aria-label={t('showArchived')} />
                {t('showArchived')} ({archivedCount})
              </label>
            )}
            <Button variant="cta" onClick={() => setDialog({ open: true })}>
              <Plus /> {t('newProject')}
            </Button>
          </>
        }
      />
      {!list.length ? (
        <EmptyState icon={FolderKanban} title={t('noProjectsTitle')} text={t('noProjectsText')}>
          <Button variant="cta" onClick={() => setDialog({ open: true })}>
            <Plus /> {t('newProject')}
          </Button>
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((p) => {
            const active = p.id === activeProjectId
            return (
              <article key={p.id} className={cn(active ? 'panel-glow' : 'panel', 'flex flex-col gap-3 p-5', p.archived && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1.5">
                      {active && (
                        <Badge tone="accent">
                          <CheckCircle2 /> {t('isActive')}
                        </Badge>
                      )}
                      {p.archived && <Badge>{t('archived')}</Badge>}
                      {p.demo && <Badge tone="warning">{t('demo')}</Badge>}
                    </div>
                    <h2 className="text-lg font-bold leading-snug text-balance">{p.name}</h2>
                  </div>
                  <Menu>
                    <MenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('actMore')}>
                        <MoreVertical />
                      </Button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setDialog({ open: true, project: p })}>
                        <Pencil /> {t('edit')}
                      </MenuItem>
                      <MenuItem
                        onSelect={async () => {
                          const c = await duplicateProject(p.id, t('copyOf', { name: p.name }))
                          setActiveProjectId(c.id)
                          toast.success(t('projectDuplicated'))
                        }}
                      >
                        <Copy /> {t('duplicate')}
                      </MenuItem>
                      <MenuItem onSelect={() => updateProject(p.id, { archived: !p.archived })}>
                        {p.archived ? <ArchiveRestore /> : <Archive />} {p.archived ? t('unarchive') : t('archive')}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem className="text-destructive [&_svg]:text-destructive" onSelect={() => remove(p)}>
                        <Trash2 /> {t('delete')}
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
                <div className="grid gap-1 text-sm text-muted-foreground">
                  {p.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" /> {p.location}
                    </span>
                  )}
                  {(p.startDate || p.endDate) && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-4" /> {[fmt(p.startDate), fmt(p.endDate)].filter(Boolean).join(' – ')}
                    </span>
                  )}
                </div>
                {p.description && <p className="line-clamp-3 text-sm">{p.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                  <span className="tabular mr-auto text-sm font-semibold">{t('participantsCount', { n: counts?.get(p.id) ?? 0 })}</span>
                  {!active && (
                    <Button size="sm" variant="outline" onClick={() => setActiveProjectId(p.id)}>
                      {t('setActive')}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => open(p)}>
                    <FolderOpen /> {t('openDirectory')}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <ProjectDialog open={dialog.open} project={dialog.project} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} />
    </div>
  )
}
