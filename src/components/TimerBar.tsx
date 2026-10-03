import { addDays } from 'date-fns'
import { Clock, ListPlus, Play, SkipForward, Square, Timer as TimerIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntryMutations, useNow, useRunningEntry } from '../data/hooks'
import { atMinutes, fromDayKey, toDateInput } from '../lib/dates'
import { formatClock, parseTimeOfDay } from '../lib/duration'
import { entrySeconds } from '../lib/stats'
import type { TimeEntry } from '../lib/types'
import { ActivityInput } from './ActivityInput'
import { EntryEditor } from './EntryEditor'
import { ProjectPicker, TagPicker } from './pickers'
import { usePomodoro } from './Pomodoro'
import { Button, IconButton, Input } from './ui'

type Mode = 'timer' | 'manual'

export function TimerBar() {
  const { t } = useTranslation()
  const { data: running } = useRunningEntry()
  const { start, stop, update, create } = useEntryMutations()
  const pomodoro = usePomodoro()
  const now = useNow(1000, !!running || pomodoro.state.endsAt !== null)

  const [mode, setMode] = useState<Mode>('timer')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [manualDay, setManualDay] = useState(toDateInput(new Date()))
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [editingRunning, setEditingRunning] = useState(false)

  // While a timer runs, the bar shows the running entry itself (so edits made
  // elsewhere appear at once); a local draft exists only while typing.
  const [draft, setDraft] = useState<string | null>(null)
  const shownDescription = running ? (draft ?? running.description) : description
  const shownProjectId = running ? running.projectId : projectId
  const shownTagIds = running ? running.tagIds : tagIds

  const elapsed = running ? entrySeconds(running, now) : 0

  useEffect(() => {
    const base = 'Kiwi Time Tracker'
    document.title = running ? `${formatClock(elapsed)} · ${running.description || base}` : base
  }, [running, elapsed])

  const reset = () => {
    setDescription('')
    setProjectId(null)
    setTagIds([])
  }

  const input = { description: description.trim(), projectId, tagIds }

  const onStart = () => {
    start.mutate(input)
    reset()
  }

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

  const phase = pomodoro.state.phase
  const pomodoroLeft = pomodoro.state.endsAt ? Math.max(0, (pomodoro.state.endsAt - now) / 1000) : 0

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-3 py-2 sm:flex-nowrap sm:gap-2 sm:px-6">
        <ActivityInput
          bare
          className="min-w-0 flex-1 basis-full sm:basis-auto"
          label={t('entry.description')}
          placeholder={t('timer.placeholder')}
          value={shownDescription}
          onChange={(v) => (running ? setDraft(v) : setDescription(v))}
          tagIds={shownTagIds}
          onApplyActivity={(a) => {
            if (running) {
              setDraft(null)
              patchRunning({ description: a.description, projectId: a.projectId, tagIds: a.tagIds })
            } else {
              setDescription(a.description)
              setProjectId(a.projectId)
              setTagIds(a.tagIds)
            }
          }}
          onPickProject={(id) => (running ? patchRunning({ projectId: id }) : setProjectId(id))}
          onAddTag={(id) => {
            if (shownTagIds.includes(id)) return
            if (running) patchRunning({ tagIds: [...shownTagIds, id] })
            else setTagIds([...tagIds, id])
          }}
          onBlur={() => {
            if (running && draft !== null && draft.trim() !== running.description) patchRunning({ description: draft.trim() })
            setDraft(null)
          }}
          onSubmit={() => {
            if (running) (document.activeElement as HTMLElement | null)?.blur()
            else if (mode === 'timer') onStart()
            else onAddManual()
          }}
        />

        <ProjectPicker value={shownProjectId} onChange={(id) => (running ? patchRunning({ projectId: id }) : setProjectId(id))} />
        <TagPicker value={shownTagIds} onChange={(ids) => (running ? patchRunning({ tagIds: ids }) : setTagIds(ids))} />

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
            {running ? (
              <button
                type="button"
                onClick={() => setEditingRunning(true)}
                title={t('timer.editRunning')}
                aria-label={t('timer.editRunning')}
                className="tabular min-w-[5.5rem] rounded-md px-1 text-right font-display text-lg font-semibold text-ink hover:bg-surface-3"
              >
                {formatClock(elapsed)}
              </button>
            ) : (
              <span className="tabular min-w-[5.5rem] text-right font-display text-lg font-semibold text-subtle">{formatClock(elapsed)}</span>
            )}
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

      <EntryEditor draft={editingRunning && running ? running : null} onClose={() => setEditingRunning(false)} />

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
