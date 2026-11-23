import * as React from 'react'
import { toast } from 'sonner'
import { Mail, Phone, UserPlus, MoreVertical, Copy, QrCode, Pencil, Trash2, AtSign } from 'lucide-react'
import { useApp } from '@/AppContext'
import { Tip } from './ui/tooltip'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from './ui/dropdown'
import { cn } from './ui/utils'
import { QrDialog } from './QrDialog'
import { WhatsAppIcon } from './WhatsAppIcon'
import { copyToClipboard, downloadText } from '@/lib/download'
import { contactText, displayName } from '@/lib/participants'
import { telHref, whatsappHref } from '@/lib/phone'
import { isValidEmail, safeFileName } from '@/lib/text'
import { participantToVCard } from '@/lib/vcard'
import type { Participant } from '@/lib/types'

export function useContactHelpers(p: Participant) {
  const { t, lang, activeProject } = useApp()
  const name = displayName(p)
  const email = isValidEmail(p.email) ? p.email.trim() : ''
  const tel = p.phone ? telHref(p.phone, p.country) : p.whatsapp ? telHref(p.whatsapp, p.country) : null
  const wa = whatsappHref(p.whatsapp || p.phone, p.country)
  const copy = async (text: string) => {
    if (await copyToClipboard(text)) toast.success(t('copied'))
    else toast.error(t('copyFailed'))
  }
  const saveContact = () => {
    downloadText(participantToVCard(p, activeProject?.name), `${safeFileName(name || 'contact')}.vcf`, 'text/vcard;charset=utf-8')
    toast.success(t('vcfDownloaded'))
  }
  return {
    name,
    email,
    tel,
    wa,
    copyEmail: () => copy(p.email),
    copyPhone: () => copy(p.phone || p.whatsapp),
    copyAll: () => copy(contactText(p, lang, activeProject?.name)),
    saveContact,
    vcard: () => participantToVCard(p, activeProject?.name),
  }
}

const iconBtn =
  'grid size-8 place-items-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
const disabledBtn = 'grid size-8 place-items-center rounded-lg text-muted-foreground/30 cursor-not-allowed'

export function ContactActions({
  p,
  onEdit,
  onDelete,
  compact,
  menuOnly,
}: {
  p: Participant
  onEdit?: () => void
  onDelete?: () => void
  compact?: boolean
  /** Only the "more" menu (the mobile card already shows big contact buttons). */
  menuOnly?: boolean
}) {
  const { t } = useApp()
  const h = useContactHelpers(p)
  const [qr, setQr] = React.useState(false)
  return (
    <div className={cn('flex items-center justify-end', compact ? 'gap-0' : 'gap-0.5')}>
      {!menuOnly && (
        <>
      {h.email ? (
        <Tip label={`${t('actEmail')}: ${h.email}`}>
          <a href={`mailto:${h.email}`} className={cn(iconBtn, 'text-[#4d9bff]')} aria-label={`${t('actEmail')} ${h.name}`}>
            <Mail className="size-[17px]" />
          </a>
        </Tip>
      ) : (
        <span className={disabledBtn} aria-hidden>
          <Mail className="size-[17px]" />
        </span>
      )}
      {h.tel ? (
        <Tip label={`${t('actCall')}: ${p.phone || p.whatsapp}`}>
          <a href={h.tel} className={cn(iconBtn, 'text-[#8fb4ff]')} aria-label={`${t('actCall')} ${h.name}`}>
            <Phone className="size-[17px]" />
          </a>
        </Tip>
      ) : (
        <span className={disabledBtn} aria-hidden>
          <Phone className="size-[17px]" />
        </span>
      )}
      {h.wa ? (
        <Tip label={t('actWhatsapp')}>
          <a
            href={h.wa}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(iconBtn, 'text-[#25D366]')}
            aria-label={`${t('actWhatsapp')} ${h.name}`}
          >
            <WhatsAppIcon className="size-[18px]" />
          </a>
        </Tip>
      ) : (
        <span className={disabledBtn} title={p.phone || p.whatsapp ? t('actWhatsappUnavailable') : undefined}>
          <WhatsAppIcon className="size-[18px]" />
        </span>
      )}
      <Tip label={t('actSaveContact')}>
        <button className={cn(iconBtn, 'text-accent')} onClick={h.saveContact} aria-label={`${t('actSaveContact')}: ${h.name}`}>
          <UserPlus className="size-[17px]" />
        </button>
      </Tip>
        </>
      )}
      <Menu>
        <MenuTrigger asChild>
          <button className={cn(iconBtn, 'text-muted-foreground')} aria-label={`${t('actMore')}: ${h.name}`}>
            <MoreVertical className="size-[17px]" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem disabled={!p.email} onSelect={h.copyEmail}>
            <AtSign /> {t('actCopyEmail')}
          </MenuItem>
          <MenuItem disabled={!p.phone && !p.whatsapp} onSelect={h.copyPhone}>
            <Phone /> {t('actCopyPhone')}
          </MenuItem>
          <MenuItem onSelect={h.copyAll}>
            <Copy /> {t('actCopyAll')}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={h.saveContact}>
            <UserPlus /> {t('actSaveContact')}
          </MenuItem>
          <MenuItem onSelect={() => setQr(true)}>
            <QrCode /> {t('actShowQr')}
          </MenuItem>
          {(onEdit || onDelete) && <MenuSeparator />}
          {onEdit && (
            <MenuItem onSelect={onEdit}>
              <Pencil /> {t('edit')}
            </MenuItem>
          )}
          {onDelete && (
            <MenuItem onSelect={onDelete} className="text-destructive [&_svg]:text-destructive">
              <Trash2 /> {t('delete')}
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      <QrDialog open={qr} onOpenChange={setQr} name={h.name} text={h.vcard()} />
    </div>
  )
}

/** Large touch-friendly buttons used on the mobile card layout. */
export function ContactButtons({ p }: { p: Participant }) {
  const { t } = useApp()
  const h = useContactHelpers(p)
  const cls = 'grid justify-items-center gap-1 rounded-xl bg-muted py-2 text-[11px] font-semibold'
  const off = 'pointer-events-none opacity-35'
  return (
    <div className="grid grid-cols-4 gap-1.5">
      <a href={h.tel ?? undefined} className={cn(cls, !h.tel && off)} aria-disabled={!h.tel}>
        <Phone className="size-4 text-[#8fb4ff]" />
        {t('actCall')}
      </a>
      <a href={h.wa ?? undefined} target="_blank" rel="noopener noreferrer" className={cn(cls, !h.wa && off)} aria-disabled={!h.wa}>
        <WhatsAppIcon className="size-4 text-[#25D366]" />
        WhatsApp
      </a>
      <a href={h.email ? `mailto:${h.email}` : undefined} className={cn(cls, !h.email && off)} aria-disabled={!h.email}>
        <Mail className="size-4 text-[#4d9bff]" />
        Email
      </a>
      <button className={cn(cls, 'bg-accent text-[#04202c]')} onClick={h.saveContact}>
        <UserPlus className="size-4" />
        {t('actSaveContactShort')}
      </button>
    </div>
  )
}
