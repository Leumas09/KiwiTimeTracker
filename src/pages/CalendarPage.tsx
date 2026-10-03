import type {
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventMountArg,
} from '@fullcalendar/core'
import enLocale from '@fullcalendar/core/locales/en-gb'
import frLocale from '@fullcalendar/core/locales/fr'
import interactionPlugin, { type EventDragStartArg, type EventResizeDoneArg } from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import * as ContextMenu from '@radix-ui/react-context-menu'
import clsx from 'clsx'
import { addDays, addMinutes } from 'date-fns'
import { CalendarPlus, ClipboardPaste, Copy, CopyPlus, Keyboard, Pencil, Play, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Kbd } from '../components/ActivityInput'
import { EntryEditor, type Anchor, type EntryDraft } from '../components/EntryEditor'
import { toast } from '../components/feedback'
import { IconButton, PageHeader, Popover } from '../components/ui'
import { useDeleteEntry, useEntries, useEntryMutations, useLookup, useNow, useRunningEntry, useSettings } from '../data/hooks'
import { tint } from '../lib/colors'
import { dayKey } from '../lib/dates'
import { useFormat } from '../lib/format'
import { entrySeconds } from '../lib/stats'
import { useColor, useIsDark } from '../lib/theme'
import type { DateRange, TimeEntry } from '../lib/types'

const DRAFT_ID = '__draft__'
const VIEW_KEY = 'kiwi-calendar-view'
const SNAP_MINUTES = 15
const VIEWS = ['timeGridDay', 'timeGridWorkWeek', 'timeGridWeek'] as const
type ViewName = (typeof VIEWS)[number]

/** Copied entry, kept while the app is open (survives page changes). */
let clipboard: Omit<TimeEntry, 'id'> | null = null

function readView(): ViewName | null {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return VIEWS.includes(v as ViewName) ? (v as ViewName) : null
  } catch {
    return null
  }
}

function rectOf(el: Element | null | undefined): Anchor | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
}

/** Time under the pointer in the time grid, snapped to 15 minutes. */
function timeAt(x: number, y: number): Date | null {
  const stack = document.elementsFromPoint(x, y)
  const col = stack.find((el) => el.matches('.fc-timegrid-col[data-date]')) as HTMLElement | undefined
  const lane = stack.find((el) => el.matches('.fc-timegrid-slot-lane[data-time]')) as HTMLElement | undefined
  if (!col || !lane) return null
  const [h, m] = lane.dataset.time!.split(':').map(Number)
  const rect = lane.getBoundingClientRect()
  const slotMinutes = 30
  const offset = Math.floor((((y - rect.top) / rect.height) * slotMinutes) / SNAP_MINUTES) * SNAP_MINUTES
  const [Y, M, D] = col.dataset.date!.split('-').map(Number)
  return new Date(Y, M - 1, D, h, m + offset)
}

const isCopyGesture = (e: { ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => e.ctrlKey || e.altKey || e.metaKey

type MenuTarget = { kind: 'event'; entry: TimeEntry; anchor: Anchor | null } | { kind: 'slot'; time: Date; anchor: Anchor } | null

export function CalendarPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fmt = useFormat()
  const color = useColor()
  const dark = useIsDark()
  const { projects } = useLookup()
  const { create, update, start: startTimer } = useEntryMutations()
  const deleteEntry = useDeleteEntry()
  const calendarRef = useRef<FullCalendar>(null)
  const [range, setRange] = useState<DateRange | null>(null)
  const [editing, setEditing] = useState<{ draft: EntryDraft; anchor: Anchor | null } | null>(null)
  const [menu, setMenu] = useState<MenuTarget>(null)
  const [copying, setCopying] = useState(false)
  const hovered = useRef<TimeEntry | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const { data: entries = [] } = useEntries(range, range !== null)
  const { data: running } = useRunningEntry()
  const now = useNow(60_000, !!running)

  const all = useMemo(() => {
    const list = entries.filter((e) => e.end)
    if (running && range && new Date(running.start) <= range.to) list.push(running)
    return list
  }, [entries, running, range])

  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all])

  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const e of all) totals.set(dayKey(e.start), (totals.get(dayKey(e.start)) ?? 0) + entrySeconds(e, now))
    return totals
  }, [all, now])

  const events = useMemo(() => {
    const list = all.map((e) => {
      const project = e.projectId ? projects.get(e.projectId) : undefined
      const edge = color(project?.color)
      return {
        id: e.id,
        title: e.description || project?.name || t('timer.noDescription'),
        start: e.start,
        end: e.end ?? new Date(now).toISOString(),
        backgroundColor: tint(edge, dark ? '#191d16' : '#ffffff', dark ? 0.32 : 0.2),
        borderColor: edge,
        textColor: dark ? '#edf0e9' : '#262626',
        editable: e.end !== null,
        classNames: e.end ? [] : ['kiwi-running'],
        extendedProps: { projectName: project?.name },
      }
    })
    // Placeholder for the entry being created, so the slot stays visible.
    const draft = editing && !editing.draft.id ? editing.draft : null
    if (draft?.end) {
      list.push({
        id: DRAFT_ID,
        title: draft.description || t('entry.newTitle'),
        start: draft.start,
        end: draft.end,
        backgroundColor: 'transparent',
        borderColor: 'var(--accent-2)',
        textColor: dark ? '#edf0e9' : '#262626',
        editable: false,
        classNames: ['kiwi-draft'],
        extendedProps: { projectName: undefined },
      })
    }
    return list
  }, [all, projects, color, t, now, dark, editing])

  const total = all.reduce((s, e) => s + entrySeconds(e, now), 0)

  // ---------------------------------------------------------------------------
  // Actions shared by the context menu, drag and drop and the keyboard
  // ---------------------------------------------------------------------------

  const openEditor = (draft: EntryDraft, anchor: Anchor | null) => setEditing({ draft, anchor })

  const copyOf = (e: TimeEntry, start: Date): Omit<TimeEntry, 'id'> => {
    const duration = new Date(e.end ?? now).getTime() - new Date(e.start).getTime()
    return { description: e.description, projectId: e.projectId, tagIds: e.tagIds, start: start.toISOString(), end: new Date(start.getTime() + duration).toISOString() }
  }

  const duplicate = (e: TimeEntry, start: Date) => {
    create
      .mutateAsync(copyOf(e, start))
      .then(() => toast(t('calendar.duplicated')))
      .catch(() => undefined)
  }

  const copy = (e: TimeEntry) => {
    clipboard = copyOf(e, new Date(e.start))
    toast(t('calendar.copied'))
  }

  const paste = (at: Date) => {
    if (!clipboard) return
    const duration = new Date(clipboard.end!).getTime() - new Date(clipboard.start).getTime()
    create.mutate({ ...clipboard, start: at.toISOString(), end: new Date(at.getTime() + duration).toISOString() })
  }

  const remove = (e: TimeEntry) => {
    if (e.end) deleteEntry(e)
  }

  // ---------------------------------------------------------------------------
  // FullCalendar callbacks
  // ---------------------------------------------------------------------------

  const onDatesSet = (arg: DatesSetArg) => {
    const next = { from: arg.start, to: new Date(arg.end.getTime() - 1) }
    if (!range || range.from.getTime() !== next.from.getTime() || range.to.getTime() !== next.to.getTime()) setRange(next)
    try {
      localStorage.setItem(VIEW_KEY, arg.view.type)
    } catch {
      // Not remembered, that is all.
    }
  }

  const onSelect = (arg: DateSelectArg) => {
    const anchor = rectOf(document.querySelector('.kiwi-calendar .fc-event-mirror')) ?? (arg.jsEvent ? pointRect(arg.jsEvent) : null)
    arg.view.calendar.unselect()
    openEditor({ description: '', projectId: null, tagIds: [], start: arg.start.toISOString(), end: arg.end.toISOString() }, anchor)
  }

  const onEventClick = (arg: EventClickArg) => {
    if (arg.event.id === DRAFT_ID) return
    const entry = byId.get(arg.event.id)
    if (entry) openEditor(entry, rectOf(arg.el))
  }

  const onMove = (arg: EventDropArg | EventResizeDoneArg) => {
    const { start, end } = arg.event
    if (!start || !end) return arg.revert()
    update.mutate({ id: arg.event.id, patch: { start: start.toISOString(), end: end.toISOString() } })
  }

  // Ctrl (or Alt / Cmd) + drag duplicates, like in Outlook.
  const onDrop = (arg: EventDropArg) => {
    const entry = byId.get(arg.event.id)
    if (entry && (isCopyGesture(arg.jsEvent) || modifier.current) && arg.event.start) {
      arg.revert()
      duplicate(entry, arg.event.start)
      return
    }
    onMove(arg)
  }

  const onDragStart = (arg: EventDragStartArg) => {
    setCopying(isCopyGesture(arg.jsEvent) || modifier.current)
    const onKey = (e: KeyboardEvent) => setCopying(isCopyGesture(e))
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    dragCleanup.current = () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      setCopying(false)
    }
  }
  const dragCleanup = useRef<() => void>(() => {})

  // Modifier keys held right now; the drag events do not always carry them.
  const modifier = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // FullCalendar ignores a press with Ctrl held (it means right click on a
  // Mac). For Outlook's Ctrl + drag, hand it the same press without Ctrl and
  // remember that this drag is a copy.
  useEffect(() => {
    const el = containerRef.current
    if (!el || /Mac|iPhone|iPad/.test(navigator.platform)) return
    const onDown = (e: MouseEvent) => {
      if (!e.isTrusted || e.button !== 0 || !e.ctrlKey || !(e.target as HTMLElement).closest('.fc-event')) return
      e.stopPropagation()
      modifier.current = true
      e.target!.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          button: 0,
          buttons: e.buttons,
          ctrlKey: false,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          view: window,
        }),
      )
    }
    el.addEventListener('mousedown', onDown, true)
    return () => el.removeEventListener('mousedown', onDown, true)
  }, [])
  useEffect(() => {
    const track = (e: KeyboardEvent) => {
      modifier.current = isCopyGesture(e)
    }
    const reset = () => {
      modifier.current = false
    }
    window.addEventListener('keydown', track)
    window.addEventListener('keyup', track)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', track)
      window.removeEventListener('keyup', track)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const onEventMount = (arg: EventMountArg) => {
    arg.el.dataset.entryId = arg.event.id
    arg.el.addEventListener('mouseenter', () => {
      hovered.current = byIdRef.current.get(arg.event.id) ?? null
    })
    arg.el.addEventListener('mouseleave', () => {
      hovered.current = null
    })
  }
  const byIdRef = useRef(byId)
  useEffect(() => {
    byIdRef.current = byId
  }, [byId])

  const renderDayHeader = (arg: DayHeaderContentArg) => {
    const seconds = dayTotals.get(dayKey(arg.date)) ?? 0
    return (
      <div className="flex flex-col items-center leading-tight">
        <span>{arg.text}</span>
        <span className={clsx('tabular text-[11px] font-normal', seconds ? 'text-ink-2' : 'text-transparent')}>{seconds ? fmt.duration(seconds) : '·'}</span>
      </div>
    )
  }

  const renderEvent = (arg: EventContentArg) => {
    const minutes = arg.event.start && arg.event.end ? (arg.event.end.getTime() - arg.event.start.getTime()) / 60_000 : 60
    // Short blocks: one line, so nothing gets cut in half.
    if (minutes < 50) {
      return (
        <div className="flex h-full items-start gap-1 overflow-hidden px-1 leading-tight">
          <span className="truncate font-semibold">{arg.event.title}</span>
          <span className="shrink-0">{arg.timeText.split(' - ')[0]}</span>
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col overflow-hidden px-1 leading-tight">
        <span className="truncate font-semibold">{arg.event.title}</span>
        {arg.event.extendedProps.projectName && arg.event.title !== arg.event.extendedProps.projectName && (
          <span className="truncate">{arg.event.extendedProps.projectName as string}</span>
        )}
        <span className="truncate">{arg.timeText}</span>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Right click
  // ---------------------------------------------------------------------------

  const onContextMenu = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-entry-id]') as HTMLElement | null
    if (target && target.dataset.entryId !== DRAFT_ID) {
      const entry = byId.get(target.dataset.entryId!)
      if (entry) {
        setMenu({ kind: 'event', entry, anchor: rectOf(target) })
        return
      }
    }
    const time = timeAt(e.clientX, e.clientY)
    if (time) {
      setMenu({ kind: 'slot', time, anchor: pointRect(e) })
      return
    }
    // Header, toolbar…: keep the browser's own menu.
    e.preventDefault()
    setMenu(null)
  }

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (editing || el.closest('input, textarea, select, [role="dialog"], [role="menu"]')) return
      const cal = calendarRef.current?.getApi()
      if (!cal) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'c' && hovered.current) {
        e.preventDefault()
        copy(hovered.current)
      } else if (mod && key === 'v' && clipboard && pointer.current) {
        const at = timeAt(pointer.current.x, pointer.current.y)
        if (at) {
          e.preventDefault()
          paste(at)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && hovered.current) {
        e.preventDefault()
        remove(hovered.current)
      } else if (mod || e.altKey) {
        return
      } else if (key === 't') cal.today()
      else if (e.key === 'ArrowLeft') cal.prev()
      else if (e.key === 'ArrowRight') cal.next()
      else if (key === '1') cal.changeView('timeGridDay')
      else if (key === '5') cal.changeView('timeGridWorkWeek')
      else if (key === '7') cal.changeView('timeGridWeek')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, now],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const initialView = isMobile ? 'timeGridDay' : (readView() ?? 'timeGridWeek')

  const item = (icon: ReactNode, label: string, onSelect: () => void, shortcut?: string, danger?: boolean, disabled?: boolean) => (
    <ContextMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className={clsx(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[highlighted]:bg-surface-3',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-xs text-muted">{shortcut}</span>}
    </ContextMenu.Item>
  )

  return (
    <div>
      <PageHeader title={t('nav.calendar')}>
        <span className="text-sm text-muted">
          {t('calendar.total')} <strong className="tabular text-ink">{fmt.duration(total)}</strong>
        </span>
        <Popover
          align="end"
          className="w-80"
          trigger={
            <IconButton label={t('calendar.shortcuts')} size="sm">
              <Keyboard size={18} />
            </IconButton>
          }
        >
          <ShortcutHelp />
        </Popover>
      </PageHeader>

      <ContextMenu.Root modal={false} onOpenChange={(open) => !open && setMenu(null)}>
        <ContextMenu.Trigger asChild>
          <div
            ref={containerRef}
            className={clsx('kiwi-calendar rounded-xl border border-border bg-surface p-2 sm:p-3', copying && 'kiwi-copying')}
            onContextMenu={onContextMenu}
            onMouseMove={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY }
            }}
          >
            <FullCalendar
              ref={calendarRef}
              plugins={[timeGridPlugin, interactionPlugin]}
              initialView={initialView}
              views={{
                timeGridDay: { buttonText: t('calendar.day') },
                timeGridWorkWeek: { type: 'timeGridWeek', hiddenDays: [0, 6], buttonText: t('calendar.workWeek') },
                timeGridWeek: { buttonText: t('calendar.week') },
              }}
              headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWorkWeek,timeGridWeek' }}
              buttonIcons={false}
              buttonText={{ today: t('time.today'), prev: '‹', next: '›' }}
              buttonHints={{ prev: t('common.previous'), next: t('common.next') }}
              locale={settings.locale === 'fr' ? frLocale : enLocale}
              firstDay={settings.weekStart}
              height="max(560px, calc(100dvh - 230px))"
              allDaySlot={false}
              nowIndicator
              scrollTime="08:00:00"
              slotDuration="00:30:00"
              snapDuration={`00:${SNAP_MINUTES}:00`}
              slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
              selectable
              selectMirror
              selectLongPressDelay={300}
              eventLongPressDelay={400}
              editable
              eventResizableFromStart
              events={events}
              datesSet={onDatesSet}
              select={onSelect}
              eventDrop={onDrop}
              eventResize={onMove}
              eventClick={onEventClick}
              eventDragStart={onDragStart}
              eventDragStop={() => dragCleanup.current()}
              eventDidMount={onEventMount}
              eventContent={renderEvent}
              dayHeaderContent={renderDayHeader}
            />
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            className="z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-lg"
            aria-label={t('calendar.actions')}
          >
            {menu?.kind === 'event' && (
              <>
                {item(<Pencil size={15} />, t('common.edit'), () => openEditor(menu.entry, menu.anchor), '↵')}
                {item(<Play size={15} />, t('calendar.restart'), () =>
                  startTimer.mutate({ description: menu.entry.description, projectId: menu.entry.projectId, tagIds: menu.entry.tagIds }),
                )}
                <ContextMenu.Separator className="my-1 h-px bg-border" />
                {item(<CopyPlus size={15} />, t('calendar.duplicateAfter'), () => duplicate(menu.entry, new Date(menu.entry.end ?? now)), undefined, false, !menu.entry.end)}
                {item(<CalendarPlus size={15} />, t('calendar.duplicateTomorrow'), () => duplicate(menu.entry, addDays(new Date(menu.entry.start), 1)), undefined, false, !menu.entry.end)}
                {item(<Copy size={15} />, t('calendar.copy'), () => copy(menu.entry), 'Ctrl+C')}
                <ContextMenu.Separator className="my-1 h-px bg-border" />
                {item(<Trash2 size={15} />, t('common.delete'), () => remove(menu.entry), t('calendar.deleteKey'), true, !menu.entry.end)}
              </>
            )}
            {menu?.kind === 'slot' && (
              <>
                <ContextMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs font-medium capitalize text-muted">
                  {fmt.date(menu.time, 'EEEE d MMMM · HH:mm')}
                </ContextMenu.Label>
                {item(<CalendarPlus size={15} />, t('calendar.newHere'), () =>
                  openEditor(
                    { description: '', projectId: null, tagIds: [], start: menu.time.toISOString(), end: addMinutes(menu.time, 30).toISOString() },
                    menu.anchor,
                  ),
                )}
                {item(<ClipboardPaste size={15} />, t('calendar.pasteHere'), () => paste(menu.time), 'Ctrl+V', false, !clipboard)}
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <EntryEditor draft={editing?.draft ?? null} anchor={editing?.anchor} onClose={() => setEditing(null)} />
    </div>
  )

  function pointRect(e: { clientX: number; clientY: number }): Anchor {
    return { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
  }
}

function ShortcutHelp() {
  const { t } = useTranslation()
  const rows: [ReactNode, string][] = [
    [<Kbd key="drag">{t('calendar.drag')}</Kbd>, t('calendar.helpCreate')],
    [
      <span key="ctrl">
        <Kbd>Ctrl</Kbd>+<Kbd>{t('calendar.drag')}</Kbd>
      </span>,
      t('calendar.helpCopyDrag'),
    ],
    [<Kbd key="right">{t('calendar.rightClick')}</Kbd>, t('calendar.helpMenu')],
    [
      <span key="c">
        <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> / <Kbd>V</Kbd>
      </span>,
      t('calendar.helpCopyPaste'),
    ],
    [<Kbd key="del">{t('calendar.deleteKey')}</Kbd>, t('calendar.helpDelete')],
    [
      <span key="nav">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd> <Kbd>T</Kbd>
      </span>,
      t('calendar.helpNavigate'),
    ],
    [
      <span key="views">
        <Kbd>1</Kbd>
        <Kbd>5</Kbd>
        <Kbd>7</Kbd>
      </span>,
      t('calendar.helpViews'),
    ],
  ]
  return (
    <div className="p-1">
      <p className="mb-2 text-sm font-semibold text-ink">{t('calendar.shortcuts')}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-ink-2">
        {rows.map(([keys, label], i) => (
          <div key={i} className="contents">
            <dt className="whitespace-nowrap">{keys}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
