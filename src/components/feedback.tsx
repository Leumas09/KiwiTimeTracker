import clsx from 'clsx'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from './ui'

// ---------------------------------------------------------------------------
// Toasts. Also reachable outside React (mutation errors) through `toast()`.
// ---------------------------------------------------------------------------

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: number
  kind: 'error' | 'success'
  message: string
  action?: ToastAction
}

type Listener = (toast: Toast) => void
const listeners = new Set<Listener>()
let nextId = 1

// eslint-disable-next-line react-refresh/only-export-components
export function toast(message: string, kind: Toast['kind'] = 'success', action?: ToastAction) {
  const t = { id: nextId++, kind, message, action }
  listeners.forEach((l) => l(t))
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    const listener: Listener = (t) => {
      setToasts((list) => [...list, t])
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), t.action ? 7000 : 4500)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg',
            t.kind === 'error' ? 'border-danger/40 bg-danger-soft text-danger' : 'border-brand-line bg-surface text-ink',
          )}
        >
          {t.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} className="text-accent-2" />}
          {t.message}
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick()
                setToasts((list) => list.filter((x) => x.id !== t.id))
              }}
              className="ml-2 rounded-md px-2 py-1 font-semibold text-brand-strong hover:bg-surface-3"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Confirmation dialog, promise based: `if (await confirm({...})) ...`
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  danger?: boolean
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<(value: boolean) => void>(() => {})

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (value: boolean) => {
    resolver.current(value)
    setOptions(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!options}
        onOpenChange={(open) => !open && close(false)}
        title={options?.title ?? ''}
        footer={
          <>
            <Button onClick={() => close(false)}>{t('common.cancel')}</Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {options?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-2">{options?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(ConfirmContext)
