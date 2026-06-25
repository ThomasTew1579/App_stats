import type { Column, ColumnFormatter, DataRow } from '@/types'
import { formatTimestamp } from '@/utils/helpers'

export const DATE_DISPLAY_FORMATS: Record<string, (ts: number) => string> = {
  'DD/MM/YYYY': (ts) => formatTimestamp(ts, 'date'),
  'DD/MM/YYYY HH:mm': (ts) => formatTimestamp(ts, 'datetime'),
  'YYYY-MM-DD': (ts) => formatTimestamp(ts, 'iso-date'),
  timestamp: (ts) => String(ts),
}

export function parseDateWithFormat(str: string, format: string): number | null {
  if (!str || typeof str !== 'string') return null
  const trimmed = str.trim()
  const tokens = format.match(/DD|MM|YYYY|HH|mm|ss/g) ?? []
  let regex = format
  const groups: string[] = []
  for (const tok of tokens) {
    if (tok === 'DD') { regex = regex.replace('DD', '(\\d{2})'); groups.push('day') }
    else if (tok === 'MM') { regex = regex.replace('MM', '(\\d{2})'); groups.push('month') }
    else if (tok === 'YYYY') { regex = regex.replace('YYYY', '(\\d{4})'); groups.push('year') }
    else if (tok === 'HH') { regex = regex.replace('HH', '(\\d{2})'); groups.push('hours') }
    else if (tok === 'mm') { regex = regex.replace('mm', '(\\d{2})'); groups.push('minutes') }
    else if (tok === 'ss') { regex = regex.replace('ss', '(\\d{2})'); groups.push('seconds') }
  }
  regex = '^' + regex.replace(/[/.:\s]/g, (m) => '\\' + m) + '$'
  const match = trimmed.match(new RegExp(regex))
  if (!match) return null
  const parts: Record<string, number> = {}
  groups.forEach((g, i) => { parts[g] = parseInt(match[i + 1], 10) })
  const date = new Date(
    parts.year,
    (parts.month || 1) - 1,
    parts.day || 1,
    parts.hours || 0,
    parts.minutes || 0,
    parts.seconds || 0,
  )
  return isNaN(date.getTime()) ? null : date.getTime()
}

export interface FormatResult {
  value: unknown
  rawTs?: number
  warning: string | null
}

export function applyFormatter(raw: unknown, formatter: ColumnFormatter): FormatResult {
  if (raw == null || raw === '') return { value: '', warning: null }
  const str = String(raw)

  switch (formatter.type) {
    case 'date': {
      const ts = parseDateWithFormat(str, formatter.inputFormat ?? 'DD/MM/YYYY HH:mm')
      if (ts == null) return { value: str, warning: `Date non convertie : "${str}"` }
      const displayFn = DATE_DISPLAY_FORMATS[formatter.displayFormat ?? 'DD/MM/YYYY HH:mm']
        ?? DATE_DISPLAY_FORMATS['DD/MM/YYYY HH:mm']
      return { value: displayFn(ts), rawTs: ts, warning: null }
    }
    case 'number': {
      const normalized = str.replace(/\s/g, '').replace(',', '.')
      const num = parseFloat(normalized)
      if (isNaN(num)) return { value: str, warning: `Nombre non converti : "${str}"` }
      return { value: num, warning: null }
    }
    case 'uppercase':
      return { value: str.toUpperCase(), warning: null }
    default:
      return { value: str, warning: null }
  }
}

export function formatCellValue(row: DataRow, col: Column): string {
  const raw = row.data[col.id]
  if (col.formatter?.type === 'date') {
    const ts = typeof raw === 'number'
      ? raw
      : parseDateWithFormat(String(raw), col.formatter.inputFormat ?? 'DD/MM/YYYY HH:mm')
    if (ts != null) {
      const displayFn = DATE_DISPLAY_FORMATS[col.formatter.displayFormat ?? 'DD/MM/YYYY HH:mm']
        ?? DATE_DISPLAY_FORMATS['DD/MM/YYYY HH:mm']
      return displayFn(ts)
    }
  }
  if (col.formatter && col.formatter.type !== 'none') {
    return String(applyFormatter(raw, col.formatter).value ?? '')
  }
  return raw != null ? String(raw) : ''
}

export function getCellRawForFilter(row: DataRow, col: Column): unknown {
  const raw = row.data[col.id]
  if (col.formatter?.type === 'date') {
    if (typeof raw === 'number') return raw
    return parseDateWithFormat(String(raw), col.formatter.inputFormat ?? 'DD/MM/YYYY HH:mm')
  }
  if (col.formatter?.type === 'number') {
    const n = parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'))
    return isNaN(n) ? null : n
  }
  return raw
}

export function getCellDisplay(row: DataRow, col: Column): string {
  return String(formatCellValue(row, col) ?? '')
}
