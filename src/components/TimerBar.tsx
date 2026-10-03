import clsx from 'clsx'
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns'
import { Clock, ListPlus, Play, SkipForward, Square, Timer as TimerIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntries, useEntryMutations, useLookup, useNow, useRunningEntry } from '../data/hooks'
import { atMinutes, dayKey, fromDayKey, toDateInput } from '../lib/dates'
import { formatClock, parseTimeOfDay } from '../lib/duration'
import { entrySeconds } from '../lib/stats'
import { useColor } from '../lib/theme'
import type { TimeEntry } from '../lib/types'
import { ProjectPicker, TagPicker } from './pickers'
import { usePomodoro } from './Pomodoro'
import { Button, ColorDot, IconButton, Input } from './ui'

type Mode = 'timer' | 'manual'

/** Last two weeks of entries, with a range that only changes once a day. */
function useRecentEntries() {
  const today = dayKey(new Date())
  const range = useMemo(() => ({ from: startOfDay(subDays(fromDayKey(today), 14)), to: endOfDay(fromDayKey(today)) }), [today])
  return useEntries(range).data ?? []
}

export function TimerBar() {
  const { t } = useTranslation()
  const { data: running } = useRunningEntry()
  const { start, stop, update, create } = useEntryMutations()
  const pomodoro = usePomodoro()
  const recent = useRecentEntries()
  const { projects } = useLookup()
  const color = useColor()
  const now = useNow(1000, !!running || pomodoro.state.endsAt !== null)

  const [mode, setMode] = useState<Mode>('timer')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [focused, setFocused] = useState(false)
  const [manualDay, setManualDay] = useState(toDateInput(new Date()))
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')

  // While running, the inputs mirror the running entry.
  const [runningId, setRunningId] = useState<string | null>(null)
  if ((running?.id ?? null) !== runningId) {
    setRunningId(running?.id ?? null)
    setDescription(running?.description ?? '')
    setProjectId(running?.projectId ?? null)
    setTagIds(running?.tagIds ?? [])
  }

  const elapsed = running ? entrySeconds(running, now) : 0

  useEffect(() => {
    const base = 'Kiwi Time Tracker'
    document.title = running ? `${formatClock(elapsed)} · ${running.description || base}` : base
  }, [running, elapsed])

  const suggestions = useMemo(() => {
    const q = description.trim().toLowerCase()
    if (!focused || !q || running) return []
    const seen = new Set<string>()
    const out: TimeEntry[] = []
    for (const e of recent) {
      const key = `${e.description}|${e.projectId}`
      if (!e.description || seen.has(key) || !e.description.toLowerCase().includes(q)) continue
      seen.add(key)
      out.push(e)
      if (out.length >= 6) break
    }
    return out
  }, [description, focused, recent, running])

  const reset = () => {
    setDescription('')
    setProjectId(null)
    setTagIds([])
  }

  const input = { description: description.trim(), projectId, tagIds }

  const onStart = () => start.mutate(input)

  const onStop = () => {
    if (!running) return
    if (pomodoro.state.phase === 'work') pomodoro.stop()
    else stop.mutate({ id: running.id })
    reset()
  }

  const patchRunning = (patch: Partial<TimeEntry>) => {
    if (running) update.mutate({ id: running.id, patch })
  }

  const manualStartMin = parseTimeOfDay(manualStart)
  const manualEndMin = parseTimeOfDay(manualEnd)
  const manualValid = manualStartMin !== null && manualEndMin !== null && !!manualDay

  const onAddManual = () => {
    if (!manualValid) return
    const from = atMinutes(fromDayKey(manualDay), manualStartMin!)
    let to = atMinutes(fromDayKey(manualDay), manualEndMin!)
    if (to < from) to = addDays(to, 1)
    create.mutate({ ...input, start: from.toISOString(), end: to.toISOString() })
    reset()
    setManualStart(manualEnd)
    setManualEnd('')
  }

  const pickSuggestion = (e: TimeEntry) => {
    setDescription(e.description)
    setProjectId(e.projectId)
    setTagIds(e.tagIds)
    setFocused(false)
  }

  const phase = pomodoro.state.phase
  const pomodoroLeft = pomodoro.state.endsAt ? Math.max(0, (pomodoro.state.endsAt - now) / 1000) : 0

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-3 py-2 sm:flex-nowrap sm:gap-2 sm:px-6">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setFocused(false), 150)
              if (running && description.trim() !== running.description) patchRunning({ description: description.trim() })
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.currentTarget.blur()
              if (!running && mode === 'timer') onStart()
              if (!running && mode === 'manual') onAddManual()
            }}
            placeholder={t('timer.placeholder')}
            aria-label={t('entry.description')}
            className="h-11 w-full rounded-lg bg-transparent px-2 text-base text-ink placeholder:text-subtle focus:bg-surface-2 focus:outline-none"
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
              {suggestions.map((s) => {
                const p = s.projectId ? projects.get(s.projectId) : undefined
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-3"
                    >
                      <span className="truncate text-ink">{s.description}</span>
                      {p && (
                        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs" style={{ color: color(p.color) }}>
                          <ColorDot color={color(p.color)} />
                          {p.name}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <ProjectPicker
          value={projectId}
          onChange={(id) => {
            setProjectId(id)
            patchRunning({ projectId: id })
          }}
        />
        <TagPicker
          value={tagIds}
          onChange={(ids) => {
            setTagIds(ids)
            patchRunning({ tagIds: ids })
          }}
        />

        {mode === 'manual' && !running ? (
          <div className="ml-auto flex items-center gap-1.5">
            <Input type="date" value={manualDay} onChange={(e) => setManualDay(e.target.value)} className="h-9 w-[8.5rem] px-2" aria-label={t('entry.date')} />
            <Input value={manualStart} onChange={(e) => setManualStart(e.target.value)} placeholder="09:00" className="h-9 w-[4.5rem] px-2 text-center" aria-label={t('entry.start')} inputMode="numeric" />
            <span className="text-subtle">–</span>
            <Input value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} placeholder="10:30" className="h-9 w-[4.5rem] px-2 text-center" aria-label={t('entry.end')} inputMode="numeric" />
            <Button variant="primary" size="sm" onClick={onAddManual} disabled={!manualValid}>
              {t('timer.add')}
            </Button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            {phase === 'work' && (
              <span className="hidden items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-strong sm:inline-flex">
                <TimerIcon size={13} /> {formatClock(pomodoroLeft).replace(/^0:/, '')}
              </span>
            )}
            <span className={clsx('tabular min-w-[5.5rem] text-right font-display text-lg font-semibold', running ? 'text-ink' : 'text-subtle')}>
              {formatClock(elapsed)}
            </span>
            {running ? (
              <button
                type="button"
                onClick={onStop}
                aria-label={t('timer.stop')}
                title={t('timer.stop')}
                className="flex size-11 items-center justify-center rounded-full bg-danger text-white shadow-sm transition-transform hover:scale-105"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onStart}
                aria-label={t('timer.start')}
                title={t('timer.start')}
                className="flex size-11 items-center justify-center rounded-full bg-brand-strong text-on-brand shadow-sm transition-transform hover:scale-105"
              >
                <Play size={18} fill="currentColor" className="translate-x-px" />
              </button>
            )}
          </div>
        )}

        <div className="flex items-center">
          {!running && (
            <IconButton
              label={mode === 'timer' ? t('timer.manualMode') : t('timer.timerMode')}
              size="sm"
              onClick={() => setMode(mode === 'timer' ? 'manual' : 'timer')}
            >
              {mode === 'timer' ? <ListPlus size={18} /> : <Clock size={18} />}
            </IconButton>
          )}
          {!running && phase === 'idle' && mode === 'timer' && (
            <IconButton label={t('pomodoro.start')} size="sm" onClick={() => pomodoro.start(input)}>
              <TimerIcon size={18} />
            </IconButton>
          )}
        </div>
      </div>

      {(phase === 'shortBreak' || phase === 'longBreak' || phase === 'ready') && (
        <div className="border-t border-brand-line bg-brand-soft">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-3 py-2 text-sm sm:px-6">
            <TimerIcon size={16} className="text-brand-strong" />
            <span className="font-medium text-ink">
              {phase === 'ready'
                ? t('pomodoro.ready', { count: pomodoro.state.completed })
                : t(phase === 'longBreak' ? 'pomodoro.longBreak' : 'pomodoro.shortBreak', { time: formatClock(pomodoroLeft).replace(/^0:/, '') })}
            </span>
            <div className="ml-auto flex gap-2">
              {phase === 'ready' ? (
                <Button size="sm" variant="primary" onClick={() => pomodoro.start(pomodoro.state.template ?? input)}>
                  <Play size={14} /> {t('pomodoro.next')}
                </Button>
              ) : (
                <Button size="sm" onClick={pomodoro.skip}>
                  <SkipForward size={14} /> {t('pomodoro.skip')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => pomodoro.stop()}>
                {t('pomodoro.end')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
