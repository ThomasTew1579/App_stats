import * as XLSX from 'xlsx'
import type { PendingImport } from '@/types'

export function parseXlsxFile(file: File): Promise<PendingImport> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })
        resolve({ rows, sheetName, fileName: file.name })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function getHeadersFromRows(rows: unknown[][], headerRowIndex: number) {
  const headerRow = rows[headerRowIndex] ?? []
  return headerRow.map((h, i) => ({
    index: i,
    label: String(h ?? '').trim() || `Colonne ${i + 1}`,
  }))
}

export function getDataRows(rows: unknown[][], headerRowIndex: number): unknown[][] {
  return rows.slice(headerRowIndex + 1).filter((row) =>
    row.some((cell) => cell !== '' && cell != null),
  )
}
