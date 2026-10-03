import clsx from 'clsx'
import { Check, FolderOpen, Plus, Search, Tag as TagIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLabels, useLookup, useProjectMutations, useTagMutations } from '../data/hooks'
import { nextColor } from '../lib/colors'
import { useColor } from '../lib/theme'
import type { Category, Project } from '../lib/types'
import { ColorDot, Popover } from './ui'

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border-strong px-2.5">
      <Search size={15} className="text-subtle" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none"
      />
    </div>
  )
}

const optionClass = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-3'

export function ProjectPicker({
  value,
  onChange,
  variant = 'chip',
}: {
  value: string | null
  onChange: (projectId: string | null) => void
  variant?: 'chip' | 'field'
}) {
  const { t } = useTranslation()
  const labels = useLabels()
  const color = useColor()
  const { projects, categories, projectList, categoryList } = useLookup()
  const { create } = useProjectMutations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = value ? projects.get(value) : undefined
  const selectedCategory = selected?.categoryId ? categories.get(selected.categoryId) : undefined

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const active = projectList.filter(
      (p) =>
        !p.archivedAt &&
        (!q || p.name.toLowerCase().includes(q) || (p.categoryId && categories.get(p.categoryId)?.name.toLowerCase().includes(q))),
    )
    const byCategory = new Map<string | null, typeof active>()
    for (const p of active) {
      const key = p.categoryId && categories.has(p.categoryId) ? p.categoryId : null
      byCategory.set(key, [...(byCategory.get(key) ?? []), p])
    }
    const ordered: { category: Category | undefined; projects: Project[] }[] = categoryList
      .filter((c) => byCategory.has(c.id))
      .map((c) => ({ category: c, projects: byCategory.get(c.id)! }))
    if (byCategory.has(null)) ordered.push({ category: undefined, projects: byCategory.get(null)! })
    return ordered
  }, [projectList, categoryList, categories, query])

  const pick = (id: string | null) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const createProject = async () => {
    const name = query.trim()
    if (!name) return
    const project = await create.mutateAsync({
      name,
      categoryId: null,
      color: nextColor(projectList.map((p) => p.color)),
      archivedAt: null,
      budgetDays: null,
      goalAmount: null,
      goalUnit: null,
      goalPeriod: null,
    })
    pick(project.id)
  }

  const exact = projectList.some((p) => p.name.toLowerCase() === query.trim().toLowerCase())

  const trigger =
    variant === 'field' ? (
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-sm text-ink"
      >
        {selected ? <ColorDot color={color(selected.color)} /> : <FolderOpen size={16} className="text-subtle" />}
        <span className={clsx('truncate', !selected && 'text-subtle')}>
          {selected ? selected.name : t('picker.noProject', { level: labels.level2 })}
        </span>
        {selectedCategory && <span className="truncate text-xs text-subtle">· {selectedCategory.name}</span>}
      </button>
    ) : (
      <button
        type="button"
        aria-label={selected ? selected.name : t('picker.chooseProject', { level: labels.level2 })}
        title={selected ? undefined : t('picker.chooseProject', { level: labels.level2 })}
        className={clsx(
          'inline-flex h-9 min-w-0 max-w-[16rem] items-center gap-1.5 rounded-lg px-2 text-sm transition-colors hover:bg-surface-3',
          selected ? 'font-medium' : 'text-muted',
        )}
        style={selected ? { color: color(selected.color) } : undefined}
      >
        {selected ? <ColorDot color={color(selected.color)} /> : <FolderOpen size={18} className="shrink-0" />}
        {selected && <span className="truncate">{selected.name}</span>}
        {selectedCategory && <span className="hidden truncate text-xs text-subtle sm:inline">· {selectedCategory.name}</span>}
      </button>
    )

  return (
    <Popover open={open} onOpenChange={setOpen} trigger={trigger}>
      <SearchBox value={query} onChange={setQuery} placeholder={t('picker.searchProject', { level: labels.level2 })} />
      <div className="max-h-72 overflow-y-auto">
        <button type="button" className={optionClass} onClick={() => pick(null)}>
          <span className="size-2.5 rounded-full border border-subtle" />
          <span className="text-muted">{t('picker.noProject', { level: labels.level2 })}</span>
          {value === null && <Check size={15} className="ml-auto text-accent-2" />}
        </button>
        {groups.map(({ category, projects: list }) => (
          <div key={category?.id ?? 'none'} className="mt-1">
            <div className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-subtle">
              {category?.name ?? t('picker.noCategory', { level: labels.level1 })}
            </div>
            {list.map((p) => (
              <button key={p.id} type="button" className={optionClass} onClick={() => pick(p.id)}>
                <ColorDot color={color(p.color)} />
                <span className="truncate">{p.name}</span>
                {value === p.id && <Check size={15} className="ml-auto text-accent-2" />}
              </button>
            ))}
          </div>
        ))}
        {query.trim() && !exact && (
          <button type="button" className={clsx(optionClass, 'mt-1 text-brand-strong')} onClick={createProject} disabled={create.isPending}>
            <Plus size={15} />
            {t('picker.create', { name: query.trim() })}
          </button>
        )}
      </div>
    </Popover>
  )
}

export function TagPicker({
  value,
  onChange,
  variant = 'chip',
}: {
  value: string[]
  onChange: (tagIds: string[]) => void
  variant?: 'chip' | 'field'
}) {
  const { t } = useTranslation()
  const { tags, tagList } = useLookup()
  const { create } = useTagMutations()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = tagList.filter((tag) => !q || tag.name.toLowerCase().includes(q))
  const exact = tagList.some((tag) => tag.name.toLowerCase() === q)
  const names = value.map((id) => tags.get(id)?.name).filter(Boolean)

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])

  const createTag = async () => {
    const tag = await create.mutateAsync(query.trim())
    onChange([...value, tag.id])
    setQuery('')
  }

  const trigger =
    variant === 'field' ? (
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-sm text-ink"
      >
        <TagIcon size={16} className="text-subtle" />
        <span className={clsx('truncate', !names.length && 'text-subtle')}>{names.length ? names.join(', ') : t('picker.noTags')}</span>
      </button>
    ) : (
      <button
        type="button"
        aria-label={t('picker.tags')}
        title={t('picker.tags')}
        className={clsx(
          'inline-flex h-9 min-w-0 max-w-[12rem] items-center gap-1.5 rounded-lg px-2 text-sm transition-colors hover:bg-surface-3',
          names.length ? 'text-brand-strong' : 'text-muted',
        )}
      >
        <TagIcon size={18} className="shrink-0" />
        {names.length > 0 && <span className="hidden truncate sm:inline">{names.join(', ')}</span>}
      </button>
    )

  return (
    <Popover trigger={trigger}>
      <SearchBox value={query} onChange={setQuery} placeholder={t('picker.searchTag')} />
      <div className="max-h-64 overflow-y-auto">
        {visible.map((tag) => (
          <button key={tag.id} type="button" className={optionClass} onClick={() => toggle(tag.id)} role="checkbox" aria-checked={value.includes(tag.id)}>
            <span
              className={clsx(
                'flex size-4 items-center justify-center rounded border',
                value.includes(tag.id) ? 'border-accent-2 bg-accent-2 text-white' : 'border-border-strong',
              )}
            >
              {value.includes(tag.id) && <Check size={12} />}
            </span>
            <span className="truncate">{tag.name}</span>
          </button>
        ))}
        {!visible.length && !q && <p className="px-2.5 py-2 text-sm text-subtle">{t('picker.noTagsYet')}</p>}
        {q && !exact && (
          <button type="button" className={clsx(optionClass, 'text-brand-strong')} onClick={createTag} disabled={create.isPending}>
            <Plus size={15} />
            {t('picker.create', { name: query.trim() })}
          </button>
        )}
      </div>
    </Popover>
  )
}
