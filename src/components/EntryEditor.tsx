import { addDays, differenceInSeconds } from 'date-fns'
import { Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntryMutations, useLabels, useSettings } from '../data/hooks'
import { atMinutes, fromDayKey, toDateInput, toTimeInput } from '../lib/dates'
import { formatDuration, parseDuration, parseTimeOfDay } from '../lib/duration'
import type { TimeEntry } from '../lib/types'
import { useConfirm } from './feedback'
import { ProjectPicker, TagPicker } from './pickers'
import { Button, Field, Input, Modal } from './ui'

export type EntryDraft = Omit<TimeEntry, 'id'> & { id?: string }

/** Modal to create or edit an entry. A draft without id is created on save. */
export function EntryEditor({ draft, onClose }: { draft: EntryDraft | null; onClose: () => void }) {
  return draft ? <EntryEditorForm key={draft.id ?? draft.start} draft={draft} onClose={onClose} /> : null
}

function EntryEditorForm({ draft, onClose }: { draft: EntryDraft; onClose: () => void }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const labels = useLabels()
  const confirm = useConfirm()
  const { create, update, remove } = useEntryMutations()
  const running = draft.id !== undefined && draft.end === null

  const startDate = new Date(draft.start)
  const endDate = draft.end ? new Date(draft.end) : null

  const [description, setDescription] = useState(draft.description)
  const [projectId, setProjectId] = useState(draft.projectId)
  const [tagIds, setTagIds] = useState(draft.tagIds)
  const [day, setDay] = useState(toDateInput(startDate))
  const [startText, setStartText] = useState(toTimeInput(startDate))
  const [endText, setEndText] = useState(endDate ? toTimeInput(endDate) : '')
  const [durationText, setDurationText] = useState(
    endDate ? formatDuration(differenceInSeconds(endDate, startDate), 'clock', settings.locale).replace(/:\d\d$/, '') : '',
  )

  const startMinutes = parseTimeOfDay(startText)
  const endMinutes = parseTimeOfDay(endText)
  const start = startMinutes !== null && day ? atMinutes(fromDayKey(day), startMinutes) : null
  let end = endMinutes !== null && day ? atMinutes(fromDayKey(day), endMinutes) : null
  // An end earlier than the start means the entry runs past midnight.
  if (start && end && end < start) end = addDays(end, 1)
  const valid = !!start && (running || !!end)

  const onDurationBlur = () => {
    const seconds = parseDuration(durationText)
    if (seconds === null || !start) return
    const newEnd = new Date(start.getTime() + seconds * 1000)
    setEndText(toTimeInput(newEnd))
  }

  const onEndBlur = () => {
    if (start && end) setDurationText(formatDuration(differenceInSeconds(end, start), 'clock', settings.locale).replace(/:\d\d$/, ''))
  }

  const save = async () => {
    if (!start) return
    const payload = {
      description: description.trim(),
      projectId,
      tagIds,
      start: start.toISOString(),
      end: running ? null : end!.toISOString(),
    }
    if (draft.id) await update.mutateAsync({ id: draft.id, patch: payload })
    else await create.mutateAsync(payload)
    onClose()
  }

  const duplicate = async () => {
    if (!start || !end) return
    await create.mutateAsync({ description: description.trim(), projectId, tagIds, start: start.toISOString(), end: end.toISOString() })
    onClose()
  }

  const destroy = async () => {
    if (!draft.id) return
    const ok = await confirm({ title: t('entry.deleteTitle'), message: t('entry.deleteMessage'), confirmLabel: t('common.delete'), danger: true })
    if (!ok) return
    await remove.mutateAsync(draft.id)
    onClose()
  }

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={draft.id ? t('entry.editTitle') : t('entry.newTitle')}
      footer={
        <>
          {draft.id && (
            <Button variant="danger" onClick={destroy} className="mr-auto">
              <Trash2 size={16} />
              {t('common.delete')}
            </Button>
          )}
          {draft.id && !running && (
            <Button onClick={duplicate}>
              <Copy size={16} />
              {t('entry.duplicate')}
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={!valid || create.isPending || update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save()
        }}
      >
        <Field label={t('entry.description')}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('timer.placeholder')} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={labels.level2}>
            <ProjectPicker value={projectId} onChange={setProjectId} variant="field" />
          </Field>
          <Field label={t('entry.tags')}>
            <TagPicker value={tagIds} onChange={setTagIds} variant="field" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <Field label={t('entry.date')} className="col-span-2 sm:col-span-1">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
          </Field>
          <Field label={t('entry.start')}>
            <Input
              value={startText}
              onChange={(e) => setStartText(e.target.value)}
              onBlur={() => start && setStartText(toTimeInput(start))}
              aria-invalid={startMinutes === null}
              inputMode="numeric"
              placeholder="09:00"
            />
          </Field>
          {running ? (
            <div className="col-span-2 flex items-end pb-2 text-sm text-brand-strong">{t('entry.running')}</div>
          ) : (
            <>
              <Field label={t('entry.end')}>
                <Input
                  value={endText}
                  onChange={(e) => setEndText(e.target.value)}
                  onBlur={() => {
                    if (end) setEndText(toTimeInput(end))
                    onEndBlur()
                  }}
                  aria-invalid={endMinutes === null}
                  inputMode="numeric"
                  placeholder="10:30"
                />
              </Field>
              <Field label={t('entry.duration')}>
                <Input value={durationText} onChange={(e) => setDurationText(e.target.value)} onBlur={onDurationBlur} placeholder="1:30" />
              </Field>
            </>
          )}
        </div>
        {!running && start && end && end.getDate() !== start.getDate() && <p className="text-xs text-subtle">{t('entry.overnight')}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
