import * as Dialog from '@radix-ui/react-dialog'
import clsx from 'clsx'
import { addDays, differenceInSeconds } from 'date-fns'
import { Copy, Info, Play, Trash2, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDeleteEntry, useEntryMutations, useLabels } from '../data/hooks'
import { atMinutes, fromDayKey, toDateInput, toTimeInput } from '../lib/dates'
import { formatClock, parseDuration, parseTimeOfDay } from '../lib/duration'
import { useFormat } from '../lib/format'
import type { TimeEntry } from '../lib/types'
import { ActivityInput, Kbd } from './ActivityInput'
import { ProjectPicker, TagPicker } from './pickers'
import { Button, IconButton } from './ui'

export type EntryDraft = Omit<TimeEntry, 'id'> & { id?: string }

/** Screen rectangle the window opens next to (the calendar slot or event). */
export interface Anchor {
  left: number
  top: number
  right: number
  bottom: number
}

const WIDTH = 460
const MARGIN = 12

/**
 * Quick entry window, used to create and edit entries everywhere. Built for
 * speed: type a few letters, pick a recent activity with ↑↓ ↵ (it fills
 * description, project and tags), adjust the times, ↵ to save.
 */
export function EntryEditor({ draft, onClose, anchor }: { draft: EntryDraft | null; onClose: () => void; anchor?: Anchor | null }) {
  return draft ? <EntryEditorForm key={draft.id ?? draft.start} draft={draft} onClose={onClose} anchor={anchor ?? null} /> : null
}

const hm = (seconds: number) => formatClock(seconds).replace(/:\d\d$/, '')

function position(anchor: Anchor | null): React.CSSProperties | undefined {
  if (!anchor || window.innerWidth < 640) return undefined
  const fitsRight = anchor.right + MARGIN + WIDTH <= window.innerWidth - MARGIN
  const left = fitsRight ? anchor.right + MARGIN : Math.max(MARGIN, anchor.left - MARGIN - WIDTH)
  const top = Math.min(Math.max(MARGIN, anchor.top), Math.max(MARGIN, window.innerHeight - 420))
  return { left, top, width: WIDTH }
}

function EntryEditorForm({ draft, onClose, anchor }: { draft: EntryDraft; onClose: () => void; anchor: Anchor | null }) {
  const { t } = useTranslation()
  const labels = useLabels()
  const fmt = useFormat()
  const { create, update, start: startTimer } = useEntryMutations()
  const deleteEntry = useDeleteEntry()
  const running = draft.id !== undefined && draft.end === null
  const [style] = useState(() => position(anchor))

  const startDate = new Date(draft.start)
  const endDate = draft.end ? new Date(draft.end) : null

  const [description, setDescription] = useState(draft.description)
  const [projectId, setProjectId] = useState(draft.projectId)
  const [tagIds, setTagIds] = useState(draft.tagIds)
  const [day, setDay] = useState(toDateInput(startDate))
  const [startText, setStartText] = useState(toTimeInput(startDate))
  const [endText, setEndText] = useState(endDate ? toTimeInput(endDate) : '')
  const [durationText, setDurationText] = useState(endDate ? hm(differenceInSeconds(endDate, startDate)) : '')
  const [help, setHelp] = useState(false)

  const startMinutes = parseTimeOfDay(startText)
  const endMinutes = parseTimeOfDay(endText)
  const start = startMinutes !== null && day ? atMinutes(fromDayKey(day), startMinutes) : null
  let end = endMinutes !== null && day ? atMinutes(fromDayKey(day), endMinutes) : null
  // An end earlier than the start means the entry runs past midnight.
  if (start && end && end < start) end = addDays(end, 1)
  const valid = !!start && (running || !!end)

  const syncDuration = (from: Date | null, to: Date | null) => {
    if (from && to) setDurationText(hm(differenceInSeconds(to, from)))
  }

  const applyDuration = () => {
    const seconds = parseDuration(durationText)
    if (seconds === null || !start) return
    const newEnd = new Date(start.getTime() + seconds * 1000)
    setEndText(toTimeInput(newEnd))
    setDurationText(hm(seconds))
  }

  const payload = () => ({
    description: description.trim(),
    projectId,
    tagIds,
    start: start!.toISOString(),
    end: running ? null : end!.toISOString(),
  })

  const save = async () => {
    if (!valid) return
    if (draft.id) await update.mutateAsync({ id: draft.id, patch: payload() })
    else await create.mutateAsync(payload())
    onClose()
  }

  const duplicate = async () => {
    if (!valid || running) return
    await create.mutateAsync(payload())
    onClose()
  }

  const restart = () => {
    startTimer.mutate({ description: description.trim(), projectId, tagIds })
    onClose()
  }

  const destroy = () => {
    if (!draft.id) return
    deleteEntry({ ...draft, id: draft.id })
    onClose()
  }

  // Ctrl/Cmd + Enter saves from anywhere in the window.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      save()
    }
  }

  const timeField = 'h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-center text-sm text-ink tabular focus:border-accent-2 focus:outline-none focus:ring-2 focus:ring-accent/30'
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.currentTarget.blur()
      // Let the blur handlers normalise the values first.
      requestAnimationFrame(() => document.getElementById('kiwi-entry-save')?.click())
    }
  }

  const anchored = !!style

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={clsx('fixed inset-0 z-40', anchored ? 'bg-transparent' : 'bg-black/40 backdrop-blur-[1px]')} />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onEscapeKeyDown={(e) => {
            // First Escape closes the suggestion list, the next one the window.
            if (document.activeElement?.getAttribute('aria-expanded') === 'true') e.preventDefault()
          }}
          style={style}
          className={clsx(
            'fixed z-50 border border-border bg-surface p-4 shadow-xl sm:p-5',
            // Anchored: no inner scrolling, so the suggestion list can spill over.
            anchored
              ? 'rounded-2xl'
              : 'overflow-y-auto inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-[480px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
          )}
        >
          <div className="mb-3 flex items-center gap-1">
            <Dialog.Title className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              {draft.id ? t('entry.editTitle') : t('entry.newTitle')}
            </Dialog.Title>
            <IconButton label={t('quick.help')} size="sm" onClick={() => setHelp((h) => !h)} aria-expanded={help}>
              <Info size={15} />
            </IconButton>
            <Dialog.Close asChild>
              <IconButton label={t('common.close')} size="sm" className="ml-auto">
                <X size={18} />
              </IconButton>
            </Dialog.Close>
          </div>

          {help && (
            <div className="mb-3 rounded-lg border border-brand-line bg-brand-soft p-3 text-xs leading-relaxed text-ink-2">
              <p>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> {t('quick.helpRecent')}
              </p>
              <p>
                <Kbd>@</Kbd> {t('quick.helpProject', { level: labels.level2.toLowerCase() })} · <Kbd>#</Kbd> {t('quick.helpTag')}
              </p>
              <p>
                <Kbd>↵</Kbd> {t('quick.helpSave')} · <Kbd>Ctrl</Kbd>
                <Kbd>↵</Kbd> {t('quick.helpSaveAnywhere')} · <Kbd>Esc</Kbd> {t('quick.helpClose')}
              </p>
            </div>
          )}

          <ActivityInput
            label={t('entry.description')}
            value={description}
            onChange={setDescription}
            tagIds={tagIds}
            onApplyActivity={(a) => {
              setDescription(a.description)
              setProjectId(a.projectId)
              setTagIds(a.tagIds)
            }}
            onPickProject={setProjectId}
            onAddTag={(id) => setTagIds((ids) => (ids.includes(id) ? ids : [...ids, id]))}
            onSubmit={save}
            placeholder={t('quick.placeholder', { level: labels.level2.toLowerCase() })}
            autoFocus
          />

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <ProjectPicker value={projectId} onChange={setProjectId} />
            <TagPicker value={tagIds} onChange={setTagIds} />
          </div>

          <div className="mt-3 grid grid-cols-[1.4fr_1fr_1fr_1fr] items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">{t('entry.date')}</span>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={clsx(timeField, 'px-1.5 text-left')} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">{t('entry.start')}</span>
              <input
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                onBlur={() => {
                  if (!start) return
                  setStartText(toTimeInput(start))
                  syncDuration(start, end)
                }}
                onKeyDown={submitOnEnter}
                aria-invalid={startMinutes === null}
                inputMode="numeric"
                placeholder="09:00"
                className={timeField}
              />
            </label>
            {running ? (
              <div className="col-span-2 pb-2 text-sm font-medium text-brand-strong">{t('entry.running')}</div>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">{t('entry.end')}</span>
                  <input
                    value={endText}
                    onChange={(e) => setEndText(e.target.value)}
                    onBlur={() => {
                      if (!end) return
                      setEndText(toTimeInput(end))
                      syncDuration(start, end)
                    }}
                    onKeyDown={submitOnEnter}
                    aria-invalid={endMinutes === null}
                    inputMode="numeric"
                    placeholder="10:30"
                    className={timeField}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted">{t('entry.duration')}</span>
                  <input
                    value={durationText}
                    onChange={(e) => setDurationText(e.target.value)}
                    onBlur={applyDuration}
                    onKeyDown={submitOnEnter}
                    placeholder="1:30"
                    className={timeField}
                  />
                </label>
              </>
            )}
          </div>
          {!running && start && end && end.getDate() !== start.getDate() && <p className="mt-1 text-xs text-muted">{t('entry.overnight')}</p>}
          {start && end && !running && (
            <p className="mt-1 text-xs capitalize text-muted">{fmt.date(start, 'EEEE d MMMM')}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-1">
            {draft.id && (
              <>
                <IconButton label={t('common.delete')} size="sm" onClick={destroy} className="hover:text-danger">
                  <Trash2 size={16} />
                </IconButton>
                {!running && (
                  <IconButton label={t('entry.duplicate')} size="sm" onClick={duplicate}>
                    <Copy size={16} />
                  </IconButton>
                )}
                {!running && (
                  <IconButton label={t('timer.continue')} size="sm" onClick={restart}>
                    <Play size={16} />
                  </IconButton>
                )}
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-xs text-muted sm:inline">
                <Kbd>Ctrl</Kbd>
                <Kbd>↵</Kbd>
              </span>
              <Button id="kiwi-entry-save" variant="primary" onClick={save} disabled={!valid || create.isPending || update.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
