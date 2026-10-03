import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { StartTimerInput } from '../data/api'
import { useEntryMutations, useRunningEntry, useSettings } from '../data/hooks'

/**
 * Pomodoro cycles on top of the timer: a work phase runs a real time entry,
 * breaks stop it. State lives in localStorage so a reload keeps the cycle.
 */

export type Phase = 'idle' | 'work' | 'shortBreak' | 'longBreak' | 'ready'

interface PomodoroState {
  phase: Phase
  endsAt: number | null
  completed: number
  template: Omit<StartTimerInput, 'start'> | null
}

const KEY = 'kiwi-pomodoro'
const IDLE: PomodoroState = { phase: 'idle', endsAt: null, completed: 0, template: null }

function load(): PomodoroState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PomodoroState) : IDLE
  } catch {
    return IDLE
  }
}

function persist(state: PomodoroState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Not persisted, still works until reload.
  }
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.8)
  } catch {
    // Audio not available.
  }
}

function notify(title: string, body: string) {
  beep()
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/pwa-192.png' })
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  }
}

interface PomodoroApi {
  state: PomodoroState
  start(template: Omit<StartTimerInput, 'start'>): Promise<void>
  stop(): Promise<void>
  skip(): void
}

const Ctx = createContext<PomodoroApi | null>(null)

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const { data: running } = useRunningEntry()
  const { start: startTimer, stop: stopTimer } = useEntryMutations()
  const [state, setState] = useState<PomodoroState>(load)
  const runningRef = useRef(running)

  useEffect(() => {
    runningRef.current = running
  }, [running])

  const update = useCallback((next: PomodoroState) => {
    persist(next)
    setState(next)
  }, [])

  const start = useCallback(
    async (template: Omit<StartTimerInput, 'start'>) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission().catch(() => undefined)
      }
      await startTimer.mutateAsync(template)
      update({ phase: 'work', endsAt: Date.now() + settings.pomodoroWork * 60_000, completed: state.phase === 'idle' ? 0 : state.completed, template })
    },
    [startTimer, update, settings.pomodoroWork, state.phase, state.completed],
  )

  const stop = useCallback(async () => {
    if (state.phase === 'work' && runningRef.current) await stopTimer.mutateAsync({ id: runningRef.current.id })
    update(IDLE)
  }, [state.phase, stopTimer, update])

  const skip = useCallback(() => {
    if (state.phase === 'shortBreak' || state.phase === 'longBreak') update({ ...state, phase: 'ready', endsAt: null })
  }, [state, update])

  // Phase transitions, checked every second.
  useEffect(() => {
    if (!state.endsAt) return
    const tick = () => {
      if (!state.endsAt || Date.now() < state.endsAt) return
      if (state.phase === 'work') {
        const entry = runningRef.current
        if (entry) stopTimer.mutate({ id: entry.id, end: new Date(state.endsAt) })
        const completed = state.completed + 1
        const long = completed % settings.pomodoroLongEvery === 0
        const minutes = long ? settings.pomodoroLongBreak : settings.pomodoroShortBreak
        update({ ...state, phase: long ? 'longBreak' : 'shortBreak', completed, endsAt: state.endsAt + minutes * 60_000 })
        notify(t('pomodoro.breakTitle'), t('pomodoro.breakBody', { minutes }))
      } else {
        update({ ...state, phase: 'ready', endsAt: null })
        notify(t('pomodoro.backTitle'), t('pomodoro.backBody'))
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [state, settings, stopTimer, update, t])

  // The timer was stopped elsewhere (another device, an edit) during a work phase: end the cycle.
  if (state.phase === 'work' && running === null) {
    persist(IDLE)
    setState(IDLE)
  }

  return <Ctx.Provider value={{ state, start, stop, skip }}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePomodoro(): PomodoroApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePomodoro outside PomodoroProvider')
  return ctx
}
