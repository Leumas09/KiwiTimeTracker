import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { displayColor } from './colors'
import type { ThemePref } from './types'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  try {
    localStorage.setItem('kiwi-theme', pref)
  } catch {
    // Storage blocked: the theme still applies for this session.
  }
}

/** Applies the user's theme preference and follows the OS in "system" mode. */
export function useApplyTheme(pref: ThemePref) {
  useEffect(() => {
    apply(pref)
    if (pref !== 'system') return
    const mq = media()
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])
}

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark')
}

/** Project color adapted to the current theme. */
export function useColor() {
  const dark = useIsDark()
  return useCallback((color: string | null | undefined) => displayColor(color, dark), [dark])
}
