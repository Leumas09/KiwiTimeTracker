import clsx from 'clsx'
import { CalendarDays, ChartColumn, Clock, FolderKanban, LayoutDashboard, LogOut, Menu, Settings, Table2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { resetDemo } from '../data/demoApi'
import { useLabels, useSettings } from '../data/hooks'
import { TimerBar } from './TimerBar'
import { Popover, Spinner } from './ui'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

export function Layout() {
  const { t } = useTranslation()
  const labels = useLabels()
  const settings = useSettings()
  const { signOut, isDemo, email } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const queryClient = useQueryClient()

  const items: NavItem[] = [
    { to: '/', label: t('nav.dashboard'), icon: <LayoutDashboard size={20} /> },
    { to: '/timer', label: t('nav.timer'), icon: <Clock size={20} /> },
    { to: '/calendar', label: t('nav.calendar'), icon: <CalendarDays size={20} /> },
    { to: '/timesheet', label: t('nav.timesheet'), icon: <Table2 size={20} /> },
    { to: '/reports', label: t('nav.reports'), icon: <ChartColumn size={20} /> },
    { to: '/projects', label: labels.level2Plural, icon: <FolderKanban size={20} /> },
    { to: '/settings', label: t('nav.settings'), icon: <Settings size={20} /> },
  ]
  const mobileMain = items.filter((i) => ['/', '/timer', '/calendar', '/reports'].includes(i.to))
  const mobileMore = items.filter((i) => !mobileMain.includes(i))

  const logout = () => {
    if (isDemo) {
      resetDemo()
      window.location.reload()
    } else {
      queryClient.clear()
      signOut()
    }
  }

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <img src="/logo.svg" alt="" className="size-9" />
          <div className="leading-tight">
            <div className="font-display text-base font-semibold text-brand">Kiwi Time</div>
            <div className="text-xs text-subtle">Tracker</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:bg-surface-3 hover:text-ink',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <div className="truncate px-3 pb-2 text-xs text-subtle">{isDemo ? t('demo.user') : (settings.displayName || email)}</div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-3 hover:text-ink"
          >
            <LogOut size={18} />
            {isDemo ? t('demo.reset') : t('nav.signOut')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && (
          <div className="bg-warning-soft px-4 py-1.5 text-center text-xs text-warning">{t('demo.banner')}</div>
        )}
        <div className="sticky top-0 z-20">
          <TimerBar />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
          <Suspense
            fallback={
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {mobileMain.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium', isActive ? 'text-brand-strong' : 'text-muted')
            }
          >
            {item.icon}
            {item.to === '/' ? t('nav.home') : item.label}
          </NavLink>
        ))}
        <Popover
          open={moreOpen}
          onOpenChange={setMoreOpen}
          align="end"
          className="w-56"
          trigger={
            <button type="button" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted">
              <Menu size={20} />
              {t('nav.more')}
            </button>
          }
        >
          {mobileMore.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-surface-3"
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-surface-3">
            <LogOut size={18} />
            {isDemo ? t('demo.reset') : t('nav.signOut')}
          </button>
        </Popover>
      </nav>
    </div>
  )
}
