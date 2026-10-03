import clsx from 'clsx'
import { CornerDownLeft, Hash, Plus } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLabels, useLookup, useProjectMutations, useRecentActivities, useTagMutations } from '../data/hooks'
import { nextColor } from '../lib/colors'
import { normalize, removeToken, searchActivities, searchProjects, searchTags, tokenAt, type Activity, type Token } from '../lib/suggestions'
import { useColor } from '../lib/theme'
import { ColorDot } from './ui'

type Option =
  | { kind: 'activity'; activity: Activity }
  | { kind: 'project'; id: string }
  | { kind: 'newProject'; name: string }
  | { kind: 'tag'; id: string }
  | { kind: 'newTag'; name: string }

/**
 * Description field that does the rest of the entry for you: recent
 * activities as you type (↑↓ then ↵ fills description, project and tags),
 * "@name" picks a project, "#name" adds a tag.
 */
export function ActivityInput({
  value,
  onChange,
  tagIds,
  onApplyActivity,
  onPickProject,
  onAddTag,
  onSubmit,
  onBlur,
  placeholder,
  autoFocus,
  className,
  label,
  bare,
}: {
  value: string
  onChange: (value: string) => void
  tagIds: string[]
  onApplyActivity: (activity: Activity) => void
  onPickProject: (projectId: string) => void
  onAddTag: (tagId: string) => void
  /** Enter without a highlighted suggestion. */
  onSubmit: () => void
  onBlur?: () => void
  placeholder: string
  autoFocus?: boolean
  className?: string
  label: string
  /** Borderless, for the timer bar. */
  bare?: boolean
}) {
  const { t } = useTranslation()
  const labels = useLabels()
  const color = useColor()
  const { projects, categories, tags, projectList, tagList } = useLookup()
  const activities = useRecentActivities()
  const createProject = useProjectMutations().create
  const createTag = useTagMutations().create
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [caret, setCaret] = useState(value.length)
  const [highlight, setHighlight] = useState(-1)

  const token: Token | null = open ? tokenAt(value, caret) : null

  const tokenKind = token?.kind
  const tokenQuery = token?.query ?? ''
  const options: Option[] = useMemo(() => {
    if (!open) return []
    if (tokenKind === '@') {
      const list: Option[] = searchProjects(projectList, categories, tokenQuery.trim()).map((p) => ({ kind: 'project', id: p.id }))
      const exists = projectList.some((p) => normalize(p.name) === normalize(tokenQuery))
      if (tokenQuery.trim() && !exists) list.push({ kind: 'newProject', name: tokenQuery.trim() })
      return list
    }
    if (tokenKind === '#') {
      const list: Option[] = searchTags(tagList, tokenQuery.trim(), tagIds).map((tag) => ({ kind: 'tag', id: tag.id }))
      const exists = tagList.some((tag) => normalize(tag.name) === normalize(tokenQuery))
      if (tokenQuery.trim() && !exists) list.push({ kind: 'newTag', name: tokenQuery.trim() })
      return list
    }
    return searchActivities(activities, value, projects, categories).map((activity) => ({ kind: 'activity', activity }))
  }, [open, tokenKind, tokenQuery, value, activities, projects, categories, projectList, tagList, tagIds])

  // In @ and # modes the first option is ready to pick; for activities the
  // user opts in with the arrows, so Enter keeps meaning "save".
  // Creating something new is never the default: it must be chosen.
  const firstIsExisting = options.length > 0 && (options[0].kind === 'project' || options[0].kind === 'tag')
  const active = token && highlight < 0 && firstIsExisting ? 0 : highlight

  const update = (text: string, position: number) => {
    onChange(text)
    setCaret(position)
    setHighlight(-1)
    setOpen(true)
  }

  const replaceToken = (tk: Token) => {
    const text = removeToken(value, tk)
    onChange(text)
    setCaret(text.length)
    setHighlight(-1)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(text.length, text.length))
  }

  const choose = async (option: Option) => {
    if (option.kind === 'activity') {
      onApplyActivity(option.activity)
      setCaret(option.activity.description.length)
      setOpen(false)
      setHighlight(-1)
      return
    }
    if (!token) return
    if (option.kind === 'project') onPickProject(option.id)
    if (option.kind === 'tag') onAddTag(option.id)
    if (option.kind === 'newProject') {
      const p = await createProject.mutateAsync({
        name: option.name,
        categoryId: null,
        color: nextColor(projectList.map((x) => x.color)),
        archivedAt: null,
        budgetDays: null,
        goalAmount: null,
        goalUnit: null,
        goalPeriod: null,
      })
      onPickProject(p.id)
    }
    if (option.kind === 'newTag') onAddTag((await createTag.mutateAsync(option.name)).id)
    replaceToken(token)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const visible = open && options.length > 0
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = e.key === 'ArrowDown' ? 1 : -1
      const count = options.length
      if (count) setHighlight(((active < 0 ? (step > 0 ? -1 : 0) : active) + step + count) % count)
      return
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (visible && active >= 0) choose(options[active])
      else onSubmit()
      return
    }
    if (e.key === 'Tab' && visible && token && active >= 0) {
      e.preventDefault()
      choose(options[active])
      return
    }
    if (e.key === 'Escape' && visible) {
      // Close the list only; a second Escape closes the dialog.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      setHighlight(-1)
    }
  }

  const heading = token?.kind === '@' ? labels.level2Plural : token?.kind === '#' ? t('picker.tags') : value.trim() ? t('quick.matches') : t('quick.recent')

  const renderOption = (option: Option): ReactNode => {
    if (option.kind === 'activity') {
      const a = option.activity
      const p = a.projectId ? projects.get(a.projectId) : undefined
      const c = p?.categoryId ? categories.get(p.categoryId) : undefined
      return (
        <>
          <span className="min-w-0 flex-1 truncate text-ink">{a.description || <span className="text-subtle">{t('timer.noDescription')}</span>}</span>
          {p && (
            <span className="flex max-w-[50%] shrink-0 items-center gap-1.5 truncate text-xs text-ink-2">
              <ColorDot color={color(p.color)} />
              <span className="truncate">{p.name}</span>
              {c && <span className="truncate text-muted">· {c.name}</span>}
            </span>
          )}
          {a.tagIds.length > 0 && (
            <span className="hidden shrink-0 text-xs text-muted sm:inline">#{a.tagIds.map((id) => tags.get(id)?.name).filter(Boolean).join(' #')}</span>
          )}
        </>
      )
    }
    if (option.kind === 'project') {
      const p = projects.get(option.id)!
      const c = p.categoryId ? categories.get(p.categoryId) : undefined
      return (
        <>
          <ColorDot color={color(p.color)} />
          <span className="truncate text-ink">{p.name}</span>
          {c && <span className="truncate text-xs text-muted">{c.name}</span>}
        </>
      )
    }
    if (option.kind === 'tag') {
      return (
        <>
          <Hash size={14} className="text-muted" />
          <span className="truncate text-ink">{tags.get(option.id)?.name}</span>
        </>
      )
    }
    return (
      <>
        <Plus size={14} className="text-brand-strong" />
        <span className="truncate text-brand-strong">{t('picker.create', { name: option.name })}</span>
        <span className="text-xs text-muted">{option.kind === 'newProject' ? labels.level2 : t('picker.tagSingular')}</span>
      </>
    )
  }

  const showList = open && options.length > 0

  return (
    <div className={clsx('relative', className)}>
      <input
        ref={inputRef}
        value={value}
        autoFocus={autoFocus}
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        onChange={(e) => update(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
        // An empty field shows recent activity at once; a filled one waits for typing or ↓.
        onFocus={() => setOpen(value.trim() === '')}
        onBlur={() => {
          setOpen(false)
          setHighlight(-1)
          onBlur?.()
        }}
        onKeyDown={onKeyDown}
        className={clsx(
          'h-11 w-full rounded-lg text-base text-ink placeholder:text-subtle focus:outline-none',
          bare
            ? 'bg-transparent px-2 focus:bg-surface-2'
            : 'border border-border-strong bg-surface px-3 focus:border-accent-2 focus:ring-2 focus:ring-accent/30',
        )}
      />
      {showList && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{heading}</div>
          <ul id={listId} role="listbox" aria-label={heading} className="max-h-72 overflow-y-auto pb-1">
            {options.map((option, i) => (
              <li
                key={i}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                // Only a real mouse move highlights: the list may open under a resting pointer.
                onMouseMove={() => i !== active && setHighlight(i)}
                onClick={() => choose(option)}
                className={clsx('flex cursor-pointer items-center gap-2 px-3 py-2 text-sm', i === active && 'bg-surface-3')}
              >
                {renderOption(option)}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3 border-t border-border bg-surface-2 px-3 py-1.5 text-[11px] text-muted">
            <span>
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> {t('quick.navigate')}
            </span>
            <span>
              <Kbd>
                <CornerDownLeft size={10} />
              </Kbd>{' '}
              {t('quick.select')}
            </span>
            {!token && (
              <span className="hidden sm:inline">
                <Kbd>@</Kbd> {labels.level2.toLowerCase()} · <Kbd>#</Kbd> tag
              </span>
            )}
            <span className="ml-auto">
              <Kbd>Esc</Kbd> {t('quick.dismiss')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded border border-border-strong bg-surface px-1 font-sans text-[10px] font-medium text-ink-2">
      {children}
    </kbd>
  )
}
