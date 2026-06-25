import type {
  DataRow, DataTable, Filter, FilterStack, FilterType, MonthlyDateMode,
} from '@/types'
import { getCellDisplay, getCellRawForFilter } from '@/core/formatters'
import { uid } from '@/utils/helpers'

export const FILTER_TYPES = [
  { value: 'text' as const, label: 'Texte' },
  { value: 'value' as const, label: 'Valeur exacte' },
  { value: 'date' as const, label: 'Date' },
  { value: 'number' as const, label: 'Nombre' },
  { value: 'empty' as const, label: 'Vide' },
  { value: 'notEmpty' as const, label: 'Non vide' },
]

export const TEXT_MODES = [
  { value: 'contains' as const, label: 'Contient' },
  { value: 'startsWith' as const, label: 'Commence par' },
  { value: 'endsWith' as const, label: 'Finit par' },
]

export const DATE_MODES = [
  { value: 'before' as const, label: 'Avant' },
  { value: 'after' as const, label: 'Après' },
  { value: 'between' as const, label: 'Dans la période' },
]

export const MONTHLY_DATE_MODES = [
  { value: 'debut_mois' as const, label: 'Au début du mois (1er à minuit)' },
  { value: 'fin_mois' as const, label: 'À la fin du mois (1er du mois suivant à minuit)' },
  { value: 'pendant_mois' as const, label: 'Pendant le mois (1er courant → 1er suivant à minuit)' },
]

export const NUMBER_MODES = [
  { value: 'gt' as const, label: 'Supérieur à' },
  { value: 'lt' as const, label: 'Inférieur à' },
  { value: 'eq' as const, label: 'Égal à' },
  { value: 'between' as const, label: 'Dans la plage' },
]

export const FILTER_CONNECTORS = [
  { value: 'ET' as const, label: 'ET', title: 'La ligne doit aussi correspondre à ce filtre' },
  { value: 'OU' as const, label: 'OU', title: 'La ligne peut correspondre à ce filtre ou aux précédentes' },
  { value: 'AVEC' as const, label: 'AVEC', title: 'La ligne doit avoir une valeur et correspondre à ce filtre' },
  { value: 'SANS' as const, label: 'SANS', title: 'Exclure les lignes correspondant à ce filtre' },
]

export function isMonthlyDateMode(mode: string | undefined): mode is MonthlyDateMode {
  return MONTHLY_DATE_MODES.some((m) => m.value === mode)
}

export function getMonthBounds(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime()
  const nextMonthStart = new Date(year, month, 1, 0, 0, 0, 0).getTime()
  return { monthStart, nextMonthStart }
}

export function matchMonthlyDateFilter(ts: number, filter: Filter, monthKey: string): boolean {
  if (ts == null || isNaN(ts) || !monthKey) return false
  const { monthStart, nextMonthStart } = getMonthBounds(monthKey)
  const cmp = filter.monthlyDateCompare ?? 'apres'

  switch (filter.dateMode) {
    case 'debut_mois':
      return cmp === 'avant' ? ts < monthStart : ts >= monthStart
    case 'fin_mois':
      return cmp === 'avant' ? ts < nextMonthStart : ts >= nextMonthStart
    case 'pendant_mois':
      return ts >= monthStart && ts < nextMonthStart
    default:
      return false
  }
}

function isEmptyValue(val: unknown): boolean {
  return val == null || val === ''
}

function matchTextFilter(cellStr: string, filter: Filter): boolean {
  const terms = (filter.terms ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (terms.length === 0) return true
  const hay = cellStr.toLowerCase()
  return terms.some((term) => {
    if (filter.matchMode === 'startsWith') return hay.startsWith(term)
    if (filter.matchMode === 'endsWith') return hay.endsWith(term)
    return hay.includes(term)
  })
}

function matchValueFilter(cellStr: string, filter: Filter): boolean {
  const selected = filter.values ?? []
  if (selected.length === 0) return true
  return selected.includes(cellStr)
}

function matchDateFilter(ts: number | null, filter: Filter): boolean {
  if (ts == null || isNaN(ts)) return false
  const d1 = filter.date1 ?? 0
  const d2 = filter.date2 ?? d1
  if (filter.dateMode === 'before') return ts < d1
  if (filter.dateMode === 'after') return ts > d1
  const min = Math.min(d1, d2)
  const max = Math.max(d1, d2)
  return ts >= min && ts <= max
}

function matchNumberFilter(num: number | null, filter: Filter): boolean {
  if (num == null || isNaN(num)) return false
  const n1 = filter.num1 ?? 0
  const n2 = filter.num2 ?? n1
  if (filter.numberMode === 'gt') return num > n1
  if (filter.numberMode === 'lt') return num < n1
  if (filter.numberMode === 'eq') return num === n1
  const min = Math.min(n1, n2)
  const max = Math.max(n1, n2)
  return num >= min && num <= max
}

export interface FilterContext {
  monthKey?: string
  monthlyContext?: boolean
}

export function rowMatchesFilter(
  row: DataRow,
  filter: Filter,
  table: DataTable,
  context: FilterContext = {},
): boolean {
  const col = table.columns.find((c) => c.id === filter.columnId)
  if (!col && filter.type !== 'empty' && filter.type !== 'notEmpty') return true

  const raw = col ? getCellRawForFilter(row, col) : null
  const display = col ? getCellDisplay(row, col) : ''

  switch (filter.type) {
    case 'text':
      return matchTextFilter(display, filter)
    case 'value':
      return matchValueFilter(display, filter)
    case 'date': {
      const ts = typeof raw === 'number' ? raw : null
      if (context.monthlyContext && context.monthKey && isMonthlyDateMode(filter.dateMode)) {
        return ts != null && matchMonthlyDateFilter(ts, filter, context.monthKey)
      }
      return matchDateFilter(ts, filter)
    }
    case 'number': {
      const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
      return matchNumberFilter(num, filter)
    }
    case 'empty':
      return isEmptyValue(raw)
    case 'notEmpty':
      return !isEmptyValue(raw)
    default:
      return true
  }
}

function rowHasColumnValue(row: DataRow, filter: Filter, table: DataTable): boolean {
  const col = table.columns.find((c) => c.id === filter.columnId)
  if (!col) return false
  return !isEmptyValue(getCellRawForFilter(row, col))
}

function unionRows(a: DataRow[], b: DataRow[]): DataRow[] {
  const ids = new Set(a.map((r) => r.id))
  const out = [...a]
  for (const r of b) {
    if (!ids.has(r.id)) {
      ids.add(r.id)
      out.push(r)
    }
  }
  return out
}

export function applyStack(
  rows: DataRow[],
  stack: FilterStack,
  table: DataTable,
  context: FilterContext = {},
): DataRow[] {
  if (!stack.filters.length) return [...rows]

  let result = rows.filter((row) => rowMatchesFilter(row, stack.filters[0], table, context))

  for (let i = 1; i < stack.filters.length; i++) {
    const filter = stack.filters[i]
    const connector = filter.connector || 'ET'
    const matches = rows.filter((row) => rowMatchesFilter(row, filter, table, context))
    const matchIds = new Set(matches.map((r) => r.id))

    switch (connector) {
      case 'OU':
        result = unionRows(result, matches)
        break
      case 'AVEC':
        result = result.filter((row) => rowHasColumnValue(row, filter, table) && matchIds.has(row.id))
        break
      case 'SANS':
        result = result.filter((row) => !matchIds.has(row.id))
        break
      case 'ET':
      default:
        result = result.filter((row) => matchIds.has(row.id))
        break
    }
  }

  return result
}

export function getDistinctValues(table: DataTable, columnId: string): string[] {
  const col = table.columns.find((c) => c.id === columnId)
  if (!col) return []
  const set = new Set<string>()
  for (const row of table.rows) {
    const v = getCellDisplay(row, col)
    if (v !== '') set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
}

export function getDateColumns(table: DataTable) {
  return table.columns.filter((c) => c.formatter?.type === 'date')
}

export function getNumberColumns(table: DataTable) {
  return table.columns.filter((c) => c.formatter?.type === 'number' || c.formatter?.type === 'none')
}

export function defaultFilter(type: FilterType, table: DataTable, monthlyContext = false): Filter {
  const col = table.columns[0]
  const base: Filter = { id: uid(), type, columnId: col?.id ?? '', connector: 'ET' }
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  switch (type) {
    case 'text':
      return { ...base, matchMode: 'contains', terms: [''] }
    case 'value':
      return { ...base, values: [] }
    case 'date':
      if (monthlyContext) return { ...base, dateMode: 'pendant_mois' }
      return { ...base, dateMode: 'after', date1: now.getTime(), date2: now.getTime() + 86400000 }
    case 'number':
      return { ...base, numberMode: 'gt', num1: 0, num2: 100 }
    default:
      return base
  }
}

export function defaultStack(): FilterStack {
  return { id: uid(), name: 'Pile de filtres', filters: [] }
}

export function resolveColumnId(table: DataTable, columnId: string, columnName?: string): string {
  if (columnId && table.columns.some((c) => c.id === columnId)) return columnId
  if (columnName) {
    const byName = table.columns.find((c) => c.name === columnName)
    if (byName) return byName.id
  }
  return table.columns[0]?.id ?? ''
}
