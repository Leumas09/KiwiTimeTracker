import clsx from 'clsx'
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '../components/feedback'
import { Button, ColorDot, EmptyState, Field, IconButton, Input, Modal, PageHeader, Segmented, Select } from '../components/ui'
import { useCategoryMutations, useLabels, useLookup, useProjectMutations, useTagMutations } from '../data/hooks'
import { nextColor, PALETTE, readableText } from '../lib/colors'
import { useFormat } from '../lib/format'
import { useColor } from '../lib/theme'
import type { Category, GoalPeriod, GoalUnit, Project, Tag, Targets } from '../lib/types'

type Section = 'categories' | 'projects' | 'tags'

export function ProjectsPage() {
  const { t } = useTranslation()
  const labels = useLabels()
  const [section, setSection] = useState<Section>('projects')
  const [showArchived, setShowArchived] = useState(false)

  return (
    <div>
      <PageHeader title={labels.level2Plural}>
        <Segmented
          value={section}
          onChange={setSection}
          options={[
            { value: 'categories', label: labels.level1Plural },
            { value: 'projects', label: labels.level2Plural },
            { value: 'tags', label: t('picker.tags') },
          ]}
        />
      </PageHeader>
      {section !== 'tags' && (
        <label className="mb-3 flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--accent-2)]" />
          {t('projects.showArchived')}
        </label>
      )}
      {section === 'categories' && <CategoryList showArchived={showArchived} />}
      {section === 'projects' && <ProjectList showArchived={showArchived} />}
      {section === 'tags' && <TagList />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function useTargetSummary() {
  const { t } = useTranslation()
  const fmt = useFormat()
  return (item: Targets) => {
    const parts: string[] = []
    if (item.budgetDays) parts.push(t('projects.budgetSummary', { amount: fmt.number(item.budgetDays) }))
    if (item.goalAmount && item.goalUnit && item.goalPeriod) {
      parts.push(
        t(item.goalPeriod === 'week' ? 'projects.goalSummaryWeek' : 'projects.goalSummaryMonth', {
          amount: `${fmt.number(item.goalAmount)} ${t(item.goalUnit === 'days' ? 'projects.unitDays' : 'projects.unitHours')}`,
        }),
      )
    }
    return parts.join(' · ')
  }
}

function Row({
  color,
  name,
  sub,
  archived,
  onEdit,
  onArchive,
  onDelete,
}: {
  color: string
  name: string
  sub?: string
  archived: boolean
  onEdit: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <li className={clsx('flex items-center gap-3 px-4 py-2.5', archived && 'opacity-60')}>
      <ColorDot color={color} className="size-3" />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="truncate font-medium text-ink">{name}</div>
        {sub && <div className="truncate text-xs text-subtle">{sub}</div>}
      </button>
      {archived && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-muted">{t('projects.archived')}</span>}
      <IconButton label={t('common.edit')} size="sm" onClick={onEdit}>
        <Pencil size={16} />
      </IconButton>
      <IconButton label={archived ? t('projects.unarchive') : t('projects.archive')} size="sm" onClick={onArchive}>
        {archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
      </IconButton>
      <IconButton label={t('common.delete')} size="sm" onClick={onDelete} className="hover:text-danger">
        <Trash2 size={16} />
      </IconButton>
    </li>
  )
}

function CategoryList({ showArchived }: { showArchived: boolean }) {
  const { t } = useTranslation()
  const labels = useLabels()
  const color = useColor()
  const confirm = useConfirm()
  const summary = useTargetSummary()
  const { categoryList, projectList } = useLookup()
  const { update, remove } = useCategoryMutations()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  const visible = categoryList.filter((c) => showArchived || !c.archivedAt)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> {t('projects.new', { level: labels.level1 })}
        </Button>
      </div>
      {visible.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {visible.map((c) => {
            const count = projectList.filter((p) => p.categoryId === c.id).length
            return (
              <Row
                key={c.id}
                color={color(c.color)}
                name={c.name}
                sub={[t('projects.count', { count, level: count > 1 ? labels.level2Plural.toLowerCase() : labels.level2.toLowerCase() }), summary(c)].filter(Boolean).join(' · ')}
                archived={!!c.archivedAt}
                onEdit={() => setEditing(c)}
                onArchive={() => update.mutate({ id: c.id, patch: { archivedAt: c.archivedAt ? null : new Date().toISOString() } })}
                onDelete={async () => {
                  const ok = await confirm({
                    title: t('projects.deleteTitle', { name: c.name }),
                    message: t('projects.deleteCategory', { level2: labels.level2Plural.toLowerCase(), level1: labels.level1.toLowerCase() }),
                    confirmLabel: t('common.delete'),
                    danger: true,
                  })
                  if (ok) remove.mutate(c.id)
                }}
              />
            )
          })}
        </ul>
      ) : (
        <EmptyState title={t('projects.emptyCategories', { level: labels.level1Plural.toLowerCase() })} />
      )}
      {editing && <TargetEditor kind="category" item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ProjectList({ showArchived }: { showArchived: boolean }) {
  const { t } = useTranslation()
  const labels = useLabels()
  const color = useColor()
  const confirm = useConfirm()
  const summary = useTargetSummary()
  const { categoryList, projectList, categories } = useLookup()
  const { update, remove } = useProjectMutations()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const visible = projectList.filter((p) => showArchived || !p.archivedAt)
  const groups = [
    ...categoryList.map((c) => ({ id: c.id, name: c.name, color: c.color, items: visible.filter((p) => p.categoryId === c.id) })),
    { id: null, name: t('picker.noCategory', { level: labels.level1 }), color: null, items: visible.filter((p) => !p.categoryId || !categories.has(p.categoryId)) },
  ].filter((g) => g.items.length)

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> {t('projects.new', { level: labels.level2 })}
        </Button>
      </div>
      {groups.length ? (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.id ?? 'none'}>
              <h2 className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-subtle">
                {g.color && <ColorDot color={color(g.color)} />}
                {g.name}
              </h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {g.items.map((p) => (
                  <Row
                    key={p.id}
                    color={color(p.color)}
                    name={p.name}
                    sub={summary(p)}
                    archived={!!p.archivedAt}
                    onEdit={() => setEditing(p)}
                    onArchive={() => update.mutate({ id: p.id, patch: { archivedAt: p.archivedAt ? null : new Date().toISOString() } })}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: t('projects.deleteTitle', { name: p.name }),
                        message: t('projects.deleteProject', { level: labels.level2.toLowerCase() }),
                        confirmLabel: t('common.delete'),
                        danger: true,
                      })
                      if (ok) remove.mutate(p.id)
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState title={t('projects.emptyProjects', { level: labels.level2Plural.toLowerCase() })} />
      )}
      {editing && <TargetEditor kind="project" item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

// ---------------------------------------------------------------------------

function TargetEditor({ kind, item, onClose }: { kind: 'category' | 'project'; item: Category | Project | null; onClose: () => void }) {
  const { t } = useTranslation()
  const labels = useLabels()
  const { categoryList, projectList } = useLookup()
  const categoryMutations = useCategoryMutations()
  const projectMutations = useProjectMutations()
  const used = (kind === 'category' ? categoryList : projectList).map((x) => x.color)

  const [name, setName] = useState(item?.name ?? '')
  const [colorValue, setColorValue] = useState(item?.color ?? nextColor(used))
  const [categoryId, setCategoryId] = useState<string | null>(item && 'categoryId' in item ? item.categoryId : null)
  const [budget, setBudget] = useState(item?.budgetDays ? String(item.budgetDays) : '')
  const [goalAmount, setGoalAmount] = useState(item?.goalAmount ? String(item.goalAmount) : '')
  const [goalUnit, setGoalUnit] = useState<GoalUnit>(item?.goalUnit ?? 'hours')
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>(item?.goalPeriod ?? 'week')

  const parse = (v: string) => {
    const n = Number(v.replace(',', '.'))
    return v.trim() && n > 0 ? n : null
  }
  const goal = parse(goalAmount)

  const save = async () => {
    const base = {
      name: name.trim(),
      color: colorValue,
      archivedAt: item?.archivedAt ?? null,
      budgetDays: parse(budget),
      goalAmount: goal,
      goalUnit: goal ? goalUnit : null,
      goalPeriod: goal ? goalPeriod : null,
    }
    if (kind === 'category') {
      if (item) await categoryMutations.update.mutateAsync({ id: item.id, patch: base })
      else await categoryMutations.create.mutateAsync(base)
    } else {
      if (item) await projectMutations.update.mutateAsync({ id: item.id, patch: { ...base, categoryId } })
      else await projectMutations.create.mutateAsync({ ...base, categoryId })
    }
    onClose()
  }

  const level = kind === 'category' ? labels.level1 : labels.level2

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={item ? t('projects.editTitle', { level }) : t('projects.newTitle', { level })}
      footer={
        <Button variant="primary" onClick={save} disabled={!name.trim()}>
          {t('common.save')}
        </Button>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) save()
        }}
      >
        <Field label={t('projects.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        {kind === 'project' && (
          <Field label={labels.level1}>
            <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
              <option value="">{t('picker.noCategory', { level: labels.level1 })}</option>
              {categoryList
                .filter((c) => !c.archivedAt || c.id === categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label={t('projects.color')}>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c.light}
                type="button"
                onClick={() => setColorValue(c.light)}
                aria-label={c.light}
                aria-pressed={colorValue.toUpperCase() === c.light.toUpperCase()}
                className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow aria-pressed:ring-2 aria-pressed:ring-ink"
                style={{ background: c.light }}
              >
                {colorValue.toUpperCase() === c.light.toUpperCase() && <Check size={16} color={readableText(c.light)} />}
              </button>
            ))}
            <input
              type="color"
              value={colorValue}
              onChange={(e) => setColorValue(e.target.value.toUpperCase())}
              aria-label={t('projects.customColor')}
              className="size-8 cursor-pointer rounded-full border border-border-strong bg-transparent p-0.5"
            />
          </div>
        </Field>
        <div className="grid gap-4 rounded-xl border border-brand-line bg-brand-soft p-4">
          <Field label={t('projects.budget')} hint={t('projects.budgetHint')}>
            <Input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="10" className="max-w-[10rem]" />
          </Field>
          <Field label={t('projects.goal')} hint={t('projects.goalHint')}>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} inputMode="decimal" placeholder="5" className="w-24" />
              <Select value={goalUnit} onChange={(e) => setGoalUnit(e.target.value as GoalUnit)} className="w-auto">
                <option value="hours">{t('projects.unitHours')}</option>
                <option value="days">{t('projects.unitDays')}</option>
              </Select>
              <Select value={goalPeriod} onChange={(e) => setGoalPeriod(e.target.value as GoalPeriod)} className="w-auto">
                <option value="week">{t('projects.perWeek')}</option>
                <option value="month">{t('projects.perMonth')}</option>
              </Select>
            </div>
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function TagList() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const { tagList } = useLookup()
  const { create, update, remove } = useTagMutations()
  const [name, setName] = useState('')

  const add = async () => {
    const value = name.trim()
    if (!value || tagList.some((tag) => tag.name.toLowerCase() === value.toLowerCase())) return
    await create.mutateAsync(value)
    setName('')
  }

  return (
    <>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('projects.newTag')} className="max-w-xs" />
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          <Plus size={16} /> {t('common.add')}
        </Button>
      </form>
      {tagList.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {tagList.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onRename={(value) => update.mutate({ id: tag.id, name: value })}
              onDelete={async () => {
                const ok = await confirm({ title: t('projects.deleteTitle', { name: tag.name }), message: t('projects.deleteTag'), confirmLabel: t('common.delete'), danger: true })
                if (ok) remove.mutate(tag.id)
              }}
            />
          ))}
        </ul>
      ) : (
        <EmptyState title={t('picker.noTagsYet')} />
      )}
    </>
  )
}

function TagRow({ tag, onRename, onDelete }: { tag: Tag; onRename: (name: string) => void; onDelete: () => void }) {
  const { t } = useTranslation()
  const [value, setValue] = useState(tag.name)
  return (
    <li className="flex items-center gap-2 px-3 py-1.5">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value.trim() && value.trim() !== tag.name && onRename(value.trim())}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={t('projects.name')}
        className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-2 text-sm text-ink hover:bg-surface-2 focus:bg-surface-2 focus:outline-none"
      />
      <IconButton label={t('common.delete')} size="sm" onClick={onDelete} className="hover:text-danger">
        <Trash2 size={16} />
      </IconButton>
    </li>
  )
}
