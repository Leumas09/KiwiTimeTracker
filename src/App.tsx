import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ConfirmProvider, toast, Toaster } from './components/feedback'
import { Layout } from './components/Layout'
import { Onboarding } from './components/Onboarding'
import { PomodoroProvider } from './components/Pomodoro'
import { Spinner } from './components/ui'
import { useProfile, useRealtimeSync } from './data/hooks'
import i18next, { setStoredLocale } from './i18n'
import { useApplyTheme } from './lib/theme'
import { LoginPage } from './pages/LoginPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TimerPage } from './pages/TimerPage'

// Heavy pages (charts, calendar) load on demand.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const TimesheetPage = lazy(() => import('./pages/TimesheetPage').then((m) => ({ default: m.TimesheetPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))

/** Turns storage errors into a message the user can act on. */
function friendlyError(error: Error): string {
  const message = error.message ?? ''
  if (/duplicate key|unique constraint/i.test(message)) return i18next.t('errors.duplicate')
  if (/one_running|already running/i.test(message)) return i18next.t('errors.running')
  if (/end_after_start|after start/i.test(message)) return i18next.t('errors.endBeforeStart')
  if (/failed to fetch|networkerror|load failed/i.test(message)) return i18next.t('errors.network')
  if (/jwt|not authenticated|401/i.test(message)) return i18next.t('errors.session')
  return i18next.t('errors.generic', { message })
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  mutationCache: new MutationCache({
    onError: (error) => toast(friendlyError(error), 'error'),
  }),
  queryCache: new QueryCache({
    onError: (error) => toast(friendlyError(error), 'error'),
  }),
})

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  )
}

/** Signed-in app: waits for the profile, then applies theme and language. */
function Shell() {
  const { i18n } = useTranslation()
  const { data: profile, error } = useProfile()
  useRealtimeSync()
  useApplyTheme(profile?.theme ?? 'system')

  useEffect(() => {
    // Before onboarding, keep the browser language: onboarding asks for it.
    if (!profile || !profile.onboarded) return
    if (i18n.language !== profile.locale) i18n.changeLanguage(profile.locale)
    setStoredLocale(profile.locale)
    document.documentElement.lang = profile.locale
  }, [profile, i18n])

  if (error) return <div className="p-8 text-center text-danger">{error.message}</div>
  if (!profile) return <FullScreenSpinner />

  return (
    <PomodoroProvider>
      <Onboarding />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="timer" element={<TimerPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </PomodoroProvider>
  )
}

function Gate() {
  const { status, userId } = useAuth()
  if (status === 'loading') return <FullScreenSpinner />
  if (status === 'signedOut') return <LoginPage />
  // Remount everything when the account changes, so caches never leak across users.
  return <Shell key={userId} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ConfirmProvider>
            <Gate />
            <Toaster />
          </ConfirmProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
