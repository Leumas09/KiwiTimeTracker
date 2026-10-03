import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { useConfirm } from '../components/feedback'
import { PRESETS } from '../components/Onboarding'
import { Button, Card, Field, Input, PageHeader, Segmented, Select } from '../components/ui'
import { resetDemo } from '../data/demoApi'
import { useSettings, useUpdateProfile } from '../data/hooks'
import { formatDuration } from '../lib/duration'
import type { DurationFormat, Profile, RoundingMode } from '../lib/types'
import { APP_BUILT_AT, APP_COMMIT_SHORT, APP_COMMIT_URL, APP_VERSION } from '../version'

/** Text/number input saved on blur. */
function BlurInput({
  value,
  onSave,
  type = 'text',
  ...rest
}: {
  value: string | number
  onSave: (value: string) => void
  type?: string
  min?: number
  max?: number
  step?: number
  className?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const [text, setText] = useState(String(value))
  const [last, setLast] = useState(String(value))
  if (String(value) !== last) {
    setLast(String(value))
    setText(String(value))
  }
  return (
    <Input
      type={type}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== String(value) && onSave(text)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      {...rest}
    />
  )
}

function Section({ id, title, description, children }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <Card id={id}>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <h2 className="font-display text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <div className="grid gap-4 md:col-span-2">{children}</div>
      </div>
    </Card>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const { mutate } = useUpdateProfile()
  const { isDemo, email, signOut } = useAuth()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const save = (patch: Partial<Omit<Profile, 'id'>>) => mutate(patch)
  const int = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || min)))

  const example = 5400 + 15 * 60 + 30

  // The version in the sidebar links to #about.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('nav.settings')} />

      <Section title={t('settings.profile')}>
        <Field label={t('settings.displayName')}>
          <BlurInput value={settings.displayName} onSave={(displayName) => save({ displayName: displayName.trim() })} />
        </Field>
      </Section>

      <Section title={t('settings.vocabulary')} description={t('settings.vocabularyHint')}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => save(PRESETS.pro[settings.locale])}>
            {t('onboarding.pro')} · {PRESETS.pro[settings.locale].level1Label} → {PRESETS.pro[settings.locale].level2Label}
          </Button>
          <Button size="sm" onClick={() => save(PRESETS.student[settings.locale])}>
            {t('onboarding.student')} · {PRESETS.student[settings.locale].level1Label} → {PRESETS.student[settings.locale].level2Label}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.level1')}>
            <BlurInput value={settings.level1Label} onSave={(v) => v.trim() && save({ level1Label: v.trim() })} />
          </Field>
          <Field label={t('settings.plural')}>
            <BlurInput value={settings.level1LabelPlural} onSave={(v) => v.trim() && save({ level1LabelPlural: v.trim() })} />
          </Field>
          <Field label={t('settings.level2')}>
            <BlurInput value={settings.level2Label} onSave={(v) => v.trim() && save({ level2Label: v.trim() })} />
          </Field>
          <Field label={t('settings.plural')}>
            <BlurInput value={settings.level2LabelPlural} onSave={(v) => v.trim() && save({ level2LabelPlural: v.trim() })} />
          </Field>
        </div>
      </Section>

      <Section title={t('settings.preferences')}>
        <Field label={t('settings.language')} group>
          <Segmented
            value={settings.locale}
            onChange={(locale) => {
              i18n.changeLanguage(locale)
              save({ locale })
            }}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <Field label={t('settings.theme')} group>
          <Segmented
            value={settings.theme}
            onChange={(theme) => save({ theme })}
            options={[
              { value: 'system', label: t('settings.themeSystem') },
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
          />
        </Field>
        <Field label={t('settings.weekStart')} group>
          <Segmented
            value={String(settings.weekStart) as '0' | '1'}
            onChange={(v) => save({ weekStart: Number(v) as 0 | 1 })}
            options={[
              { value: '1', label: t('settings.monday') },
              { value: '0', label: t('settings.sunday') },
            ]}
          />
        </Field>
        <Field label={t('settings.dayHours')} hint={t('settings.dayHoursHint')}>
          <BlurInput
            type="number"
            min={1}
            max={24}
            step={0.5}
            inputMode="decimal"
            className="max-w-[8rem]"
            value={settings.dayHours}
            onSave={(v) => {
              const n = Number(v.replace(',', '.'))
              if (n > 0 && n <= 24) save({ dayHours: n })
            }}
          />
        </Field>
        <Field label={t('settings.durationFormat')}>
          <Select value={settings.durationFormat} onChange={(e) => save({ durationFormat: e.target.value as DurationFormat })} className="max-w-xs">
            {(['hm', 'decimal', 'clock'] as DurationFormat[]).map((f) => (
              <option key={f} value={f}>
                {t(`settings.format.${f}`)} — {formatDuration(example, f, settings.locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('settings.rounding')} hint={t('settings.roundingHint')} group>
          <div className="flex flex-wrap gap-2">
            <Select aria-label={t('settings.rounding')} value={settings.roundingMinutes} onChange={(e) => save({ roundingMinutes: Number(e.target.value) })} className="w-auto">
              {[0, 1, 5, 6, 10, 15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? t('settings.noRounding') : t('settings.minutes', { count: m })}
                </option>
              ))}
            </Select>
            <Select
              aria-label={t('settings.roundingMode')}
              value={settings.roundingMode}
              onChange={(e) => save({ roundingMode: e.target.value as RoundingMode })}
              disabled={!settings.roundingMinutes}
              className="w-auto"
            >
              <option value="nearest">{t('settings.roundNearest')}</option>
              <option value="up">{t('settings.roundUp')}</option>
              <option value="down">{t('settings.roundDown')}</option>
            </Select>
          </div>
        </Field>
      </Section>

      <Section title="Pomodoro" description={t('settings.pomodoroHint')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t('settings.pomodoroWork')}>
            <BlurInput type="number" min={1} max={180} value={settings.pomodoroWork} onSave={(v) => save({ pomodoroWork: int(v, 1, 180) })} />
          </Field>
          <Field label={t('settings.pomodoroShort')}>
            <BlurInput type="number" min={1} max={60} value={settings.pomodoroShortBreak} onSave={(v) => save({ pomodoroShortBreak: int(v, 1, 60) })} />
          </Field>
          <Field label={t('settings.pomodoroLong')}>
            <BlurInput type="number" min={1} max={120} value={settings.pomodoroLongBreak} onSave={(v) => save({ pomodoroLongBreak: int(v, 1, 120) })} />
          </Field>
          <Field label={t('settings.pomodoroEvery')}>
            <BlurInput type="number" min={2} max={12} value={settings.pomodoroLongEvery} onSave={(v) => save({ pomodoroLongEvery: int(v, 2, 12) })} />
          </Field>
        </div>
      </Section>

      <Section title={t('settings.account')}>
        {isDemo ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">{t('demo.explain')}</p>
            <Button
              variant="danger"
              onClick={async () => {
                if (await confirm({ title: t('demo.reset'), message: t('demo.resetConfirm'), confirmLabel: t('demo.reset'), danger: true })) {
                  resetDemo()
                  window.location.reload()
                }
              }}
            >
              {t('demo.reset')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-ink-2">{email}</span>
            <Button
              onClick={() => {
                queryClient.clear()
                signOut()
              }}
            >{t('nav.signOut')}</Button>
          </div>
        )}
      </Section>

      <Section id="about" title={t('settings.about')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted">{t('settings.version')}</dt>
          <dd className="tabular font-medium text-ink" data-testid="app-version">{APP_VERSION}</dd>
          <dt className="text-muted">{t('settings.commit')}</dt>
          <dd className="tabular text-ink">
            {APP_COMMIT_URL ? (
              <a href={APP_COMMIT_URL} target="_blank" rel="noreferrer" className="text-brand-strong underline-offset-2 hover:underline">
                {APP_COMMIT_SHORT}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt className="text-muted">{t('settings.builtAt')}</dt>
          <dd className="tabular text-ink">
            {APP_BUILT_AT.toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
          </dd>
        </dl>
      </Section>
    </div>
  )
}
