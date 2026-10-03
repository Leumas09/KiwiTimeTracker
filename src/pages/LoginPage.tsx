import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, type OAuthProvider } from '../auth/AuthProvider'
import { toast } from '../components/feedback'
import { Button } from '../components/ui'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const [pending, setPending] = useState<OAuthProvider | null>(null)

  const go = async (provider: OAuthProvider) => {
    setPending(provider)
    try {
      await signIn(provider)
    } catch (error) {
      toast((error as Error).message, 'error')
      setPending(null)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <img src="/logo.svg" alt="" className="mx-auto mb-4 size-24" />
        <h1 className="font-display text-2xl font-semibold text-brand">Kiwi Time Tracker</h1>
        <p className="mb-8 mt-2 text-sm text-muted">{t('login.tagline')}</p>
        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={() => go('google')} disabled={pending !== null}>
            <GoogleIcon />
            {t('login.google')}
          </Button>
          <Button size="lg" onClick={() => go('azure')} disabled={pending !== null}>
            <MicrosoftIcon />
            {t('login.microsoft')}
          </Button>
        </div>
      </div>
    </div>
  )
}
