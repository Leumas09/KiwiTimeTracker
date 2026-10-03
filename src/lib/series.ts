import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLabels, useLookup } from '../data/hooks'
import { PALETTE } from './colors'
import { NONE, type Dimension } from './stats'
import { useColor } from './theme'

export const OTHER = '__other__'
const MAX_SERIES = 8

export interface GroupMeta {
  name: string
  color: string
}

/** Name and theme-aware color for a group key of a dimension. */
export function useGroupMeta() {
  const { t } = useTranslation()
  const labels = useLabels()
  const color = useColor()
  const { categories, projects, tags, tagList } = useLookup()

  return useCallback(
    (dimension: Dimension, key: string): GroupMeta => {
      if (key === OTHER) return { name: t('reports.other'), color: color(null) }
      if (key === NONE) {
        const name =
          dimension === 'project'
            ? t('picker.noProject', { level: labels.level2 })
            : dimension === 'category'
              ? t('picker.noCategory', { level: labels.level1 })
              : t('picker.noTags')
        return { name, color: color(null) }
      }
      if (dimension === 'project') {
        const p = projects.get(key)
        return { name: p?.name ?? '?', color: color(p?.color) }
      }
      if (dimension === 'category') {
        const c = categories.get(key)
        return { name: c?.name ?? '?', color: color(c?.color) }
      }
      // Tags have no color of their own: a stable palette slot from their order.
      const index = tagList.findIndex((tag) => tag.id === key)
      return { name: tags.get(key)?.name ?? '?', color: color(PALETTE[Math.max(0, index) % PALETTE.length].light) }
    },
    [t, labels, color, categories, projects, tags, tagList],
  )
}

/**
 * Keeps the biggest groups and folds the rest into "Other", so charts never
 * need more than eight distinguishable colors.
 */
export function foldKeys(totals: { key: string; seconds: number }[]): { keep: Set<string>; folded: boolean } {
  if (totals.length <= MAX_SERIES) return { keep: new Set(totals.map((t) => t.key)), folded: false }
  return { keep: new Set(totals.slice(0, MAX_SERIES - 1).map((t) => t.key)), folded: true }
}
