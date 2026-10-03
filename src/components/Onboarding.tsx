import clsx from 'clsx'
import { Briefcase, GraduationCap, PenLine } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings, useUpdateProfile } from '../data/hooks'
import type { Locale, Profile } from '../lib/types'
import { Button, Field, Input, Modal, Segmented } from './ui'

type Labels = Pick<Profile, 'level1Label' | 'level1LabelPlural' | 'level2Label' | 'level2LabelPlural'>

// eslint-disable-next-line react-refresh/only-export-components
export const PRESETS: Record<'pro' | 'student', Record<Locale, Labels>> = {
  pro: {
    fr: { level1Label: 'Client', level1LabelPlural: 'Clients', level2Label: 'Projet', level2LabelPlural: 'Projets' },
    en: { level1Label: 'Client', level1LabelPlural: 'Clients', level2Label: 'Project', level2LabelPlural: 'Projects' },
  },
  student: {
    fr: { level1Label: 'Matière', level1LabelPlural: 'Matières', level2Label: 'Sujet', level2LabelPlural: 'Sujets' },
    en: { level1Label: 'Subject', level1LabelPlural: 'Subjects', level2Label: 'Topic', level2LabelPlural: 'Topics' },
  },
}

/** First launch: pick the vocabulary (consultant, student or custom) and language. */
export function Onboarding() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const updateProfile = useUpdateProfile()
  // Starts from the browser language (the profile only has a default).
  const [locale, setLocale] = useState<Locale>(i18n.language === 'en' ? 'en' : 'fr')
  const [choice, setChoice] = useState<'pro' | 'student' | 'custom'>('pro')
  const [custom, setCustom] = useState<Labels>(PRESETS.pro[i18n.language === 'en' ? 'en' : 'fr'])

  if (settings.onboarded) return null

  const labels = choice === 'custom' ? custom : PRESETS[choice][locale]

  const finish = () => {
    updateProfile.mutate({ ...labels, locale, onboarded: true })
  }

  const option = (value: typeof choice, icon: React.ReactNode, title: string, example: string) => (
    <button
      type="button"
      onClick={() => setChoice(value)}
      aria-pressed={choice === value}
      className={clsx(
        'flex flex-1 flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors',
        choice === value ? 'border-accent-2 bg-brand-soft' : 'border-border-strong hover:bg-surface-2',
      )}
    >
      <span className={choice === value ? 'text-brand-strong' : 'text-muted'}>{icon}</span>
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="text-xs text-muted">{example}</span>
    </button>
  )

  return (
    <Modal open dismissible={false} onOpenChange={() => undefined} title={t('onboarding.title')} footer={<Button variant="primary" onClick={finish}>{t('onboarding.start')}</Button>}>
      <div className="grid gap-5">
        <p className="text-sm text-muted">{t('onboarding.intro')}</p>
        <Field label={t('settings.language')} group>
          <Segmented
            value={locale}
            onChange={(l) => {
              setLocale(l)
              i18n.changeLanguage(l)
              if (choice !== 'custom') setCustom(PRESETS[choice][l])
            }}
            options={[
              { value: 'fr', label: 'Français' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>
        <div className="flex flex-col gap-2 sm:flex-row">
          {option('pro', <Briefcase size={24} />, t('onboarding.pro'), `${PRESETS.pro[locale].level1Label} → ${PRESETS.pro[locale].level2Label}`)}
          {option('student', <GraduationCap size={24} />, t('onboarding.student'), `${PRESETS.student[locale].level1Label} → ${PRESETS.student[locale].level2Label}`)}
          {option('custom', <PenLine size={24} />, t('onboarding.custom'), t('onboarding.customHint'))}
        </div>
        {choice === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('settings.level1')}>
              <Input value={custom.level1Label} onChange={(e) => setCustom({ ...custom, level1Label: e.target.value })} />
            </Field>
            <Field label={t('settings.plural')}>
              <Input value={custom.level1LabelPlural} onChange={(e) => setCustom({ ...custom, level1LabelPlural: e.target.value })} />
            </Field>
            <Field label={t('settings.level2')}>
              <Input value={custom.level2Label} onChange={(e) => setCustom({ ...custom, level2Label: e.target.value })} />
            </Field>
            <Field label={t('settings.plural')}>
              <Input value={custom.level2LabelPlural} onChange={(e) => setCustom({ ...custom, level2LabelPlural: e.target.value })} />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}
