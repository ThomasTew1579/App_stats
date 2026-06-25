import type { DataTable, TableInfo } from '@/types'
import { parseDateWithFormat } from '@/core/formatters'
import { formatTimestamp, pad2 } from '@/utils/helpers'

function getDateTs(row: import('@/types').DataRow, col: import('@/types').Column): number | null {
  const raw = row.data[col.id]
  if (typeof raw === 'number') return raw
  return parseDateWithFormat(String(raw), col.formatter?.inputFormat ?? 'DD/MM/YYYY HH:mm')
}

function formatTs(ts: number): string {
  return formatTimestamp(ts, 'datetime')
}

export function collectTableInfo(table: DataTable): TableInfo {
  const info: TableInfo = {
    name: table.name,
    sourceFile: table.sourceFileName || '—',
    rowCount: table.rows.length,
    colCount: table.columns.length,
    emptyCells: 0,
    totalCells: table.rows.length * table.columns.length,
    columnTypes: [],
    dateColumns: [],
    numberStats: [],
  }

  for (const col of table.columns) {
    const type = col.formatter?.type || 'texte'
    info.columnTypes.push({ name: col.name, type })

    if (col.formatter?.type === 'date') {
      let min: number | null = null
      let max: number | null = null
      let valid = 0
      for (const row of table.rows) {
        const ts = getDateTs(row, col)
        if (ts != null && !isNaN(ts)) {
          valid++
          if (min == null || ts < min) min = ts
          if (max == null || ts > max) max = ts
        }
      }
      info.dateColumns.push({
        name: col.name,
        min: min != null ? formatTs(min) : '—',
        max: max != null ? formatTs(max) : '—',
        valid,
      })
    }

    if (col.formatter?.type === 'number') {
      let min: number | null = null
      let max: number | null = null
      let valid = 0
      for (const row of table.rows) {
        const v = parseFloat(String(row.data[col.id]).replace(',', '.'))
        if (!isNaN(v)) {
          valid++
          if (min == null || v < min) min = v
          if (max == null || v > max) max = v
        }
      }
      info.numberStats.push({
        name: col.name,
        min: min ?? '—',
        max: max ?? '—',
        valid,
      })
    }
  }

  for (const row of table.rows) {
    for (const col of table.columns) {
      const v = row.data[col.id]
      if (v == null || v === '') info.emptyCells++
    }
  }

  return info
}

export { pad2 }
