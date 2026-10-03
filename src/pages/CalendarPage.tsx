import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core'
import enLocale from '@fullcalendar/core/locales/en-gb'
import frLocale from '@fullcalendar/core/locales/fr'
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EntryEditor, type EntryDraft } from '../components/EntryEditor'
import { PageHeader } from '../components/ui'
import { useEntries, useEntryMutations, useLookup, useNow, useRunningEntry, useSettings } from '../data/hooks'
import { tint } from '../lib/colors'
import { useFormat } from '../lib/format'
import { entrySeconds } from '../lib/stats'
import { useColor, useIsDark } from '../lib/theme'
import type { DateRange, TimeEntry } from '../lib/types'

export function CalendarPage() {
  const { t } = useTranslation()
  const settings = useSettings()
  const fmt = useFormat()
  const color = useColor()
  const dark = useIsDark()
  const { projects } = useLookup()
  const { update } = useEntryMutations()
  const [range, setRange] = useState<DateRange | null>(null)
  const [editing, setEditing] = useState<EntryDraft | null>(null)
  const { data: entries = [] } = useEntries(range, range !== null)
  const { data: running } = useRunningEntry()
  const now = useNow(60_000, !!running)

  const all = useMemo(() => {
    const list = entries.filter((e) => e.end)
    if (running && range && new Date(running.start) <= range.to) list.push(running)
    return list
  }, [entries, running, range])

  const events = useMemo(
    () =>
      all.map((e) => {
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
          extendedProps: { entry: e, projectName: project?.name },
        }
      }),
    [all, projects, color, t, now, dark],
  )

  const total = all.reduce((s, e) => s + entrySeconds(e, now), 0)

  const onDatesSet = (arg: DatesSetArg) => {
    const next = { from: arg.start, to: new Date(arg.end.getTime() - 1) }
    if (!range || range.from.getTime() !== next.from.getTime() || range.to.getTime() !== next.to.getTime()) setRange(next)
  }

  const onSelect = (arg: DateSelectArg) => {
    arg.view.calendar.unselect()
    setEditing({ description: '', projectId: null, tagIds: [], start: arg.start.toISOString(), end: arg.end.toISOString() })
  }

  const onMove = (arg: EventDropArg | EventResizeDoneArg) => {
    const { start, end } = arg.event
    if (!start || !end) return arg.revert()
    update.mutate({ id: arg.event.id, patch: { start: start.toISOString(), end: end.toISOString() } })
  }

  const onClick = (arg: EventClickArg) => setEditing(arg.event.extendedProps.entry as TimeEntry)

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

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div>
      <PageHeader title={t('nav.calendar')}>
        <span className="text-sm text-muted">
          {t('calendar.total')} <strong className="tabular text-ink">{fmt.duration(total)}</strong>
        </span>
      </PageHeader>
      <div className="kiwi-calendar rounded-xl border border-border bg-surface p-2 sm:p-3">
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek' }}
          buttonIcons={false}
          buttonText={{ today: t('time.today'), day: t('calendar.day'), week: t('calendar.week'), prev: '‹', next: '›' }}
          buttonHints={{ prev: t('common.previous'), next: t('common.next') }}
          locale={settings.locale === 'fr' ? frLocale : enLocale}
          firstDay={settings.weekStart}
          height="max(560px, calc(100dvh - 230px))"
          allDaySlot={false}
          nowIndicator
          scrollTime="08:00:00"
          slotDuration="00:30:00"
          snapDuration="00:05:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          selectable
          selectMirror
          editable
          eventResizableFromStart
          events={events}
          datesSet={onDatesSet}
          select={onSelect}
          eventDrop={onMove}
          eventResize={onMove}
          eventClick={onClick}
          eventContent={renderEvent}
        />
      </div>
      <EntryEditor draft={editing} onClose={() => setEditing(null)} />
    </div>
  )
}
