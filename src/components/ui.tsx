import * as Dialog from '@radix-ui/react-dialog'
import * as RadixPopover from '@radix-ui/react-popover'
import clsxBase, { type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { forwardRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

const clsx = (...values: ClassValue[]) => twMerge(clsxBase(values))

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-strong text-on-brand hover:bg-brand-strong-hover shadow-sm',
  secondary: 'bg-surface text-ink border border-border-strong hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3',
  danger: 'bg-surface text-danger border border-border-strong hover:bg-danger-soft',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: 'sm' | 'md' }
>(function IconButton({ label, size = 'md', className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    />
  )
})

const fieldClass =
  'h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-accent-2 focus:outline-none focus:ring-2 focus:ring-accent/30'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={clsx(fieldClass, className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={clsx(fieldClass, 'pr-8', className)} {...props} />
})

/**
 * Labelled form field. Use `group` when the content is not a single native
 * control (segmented buttons, swatches, several inputs): a <label> would
 * otherwise rename the first button inside it.
 */
export function Field({ label, hint, children, className, group }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; group?: boolean }) {
  const id = useId()
  if (group) {
    return (
      <div role="group" aria-labelledby={id} className={clsx('flex flex-col gap-1.5', className)}>
        <span id={id} className="text-sm font-medium text-ink-2">
          {label}
        </span>
        {children}
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </div>
    )
  }
  return (
    <label className={clsx('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </label>
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-border bg-surface p-4 sm:p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-base font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-2xl font-semibold text-brand">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  wide,
  dismissible = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  dismissible?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
          className={clsx(
            'fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <Dialog.Title className="font-display text-lg font-semibold text-ink">{title}</Dialog.Title>
            {dismissible && (
              <Dialog.Close asChild>
                <IconButton label={t('common.close')} size="sm">
                  <X size={18} />
                </IconButton>
              </Dialog.Close>
            )}
          </div>
          {children}
          {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'start',
  className,
}: {
  trigger: ReactNode
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'center' | 'end'
  className?: string
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={clsx('z-50 w-72 max-w-[calc(100vw-24px)] rounded-xl border border-border bg-surface p-2 shadow-lg', className)}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-border-strong bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({ ratio, level, label }: { ratio: number; level: 'ok' | 'warning' | 'over'; label: string }) {
  const color = level === 'over' ? 'bg-danger' : level === 'warning' ? 'bg-warning' : 'bg-accent-2'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full transition-[width]', color)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center">
      {icon && <div className="text-subtle">{icon}</div>}
      <p className="font-medium text-ink-2">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  )
}

export function ColorDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={clsx('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: color }} />
}

export function Spinner() {
  return <div className="size-6 animate-spin rounded-full border-2 border-brand-line border-t-brand-strong" role="status" aria-label="…" />
}
