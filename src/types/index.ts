export type FormatterType = 'none' | 'date' | 'number' | 'uppercase'

export interface ColumnFormatter {
  type: FormatterType
  inputFormat?: string
  displayFormat?: string
}

export interface Column {
  id: string
  name: string
  sourceKey: string
  formatter: ColumnFormatter
}

export interface DataRow {
  id: string
  data: Record<string, unknown>
}

export type FilterType = 'text' | 'value' | 'date' | 'number' | 'empty' | 'notEmpty'
export type FilterConnector = 'ET' | 'OU' | 'AVEC' | 'SANS'
export type TextMatchMode = 'contains' | 'startsWith' | 'endsWith'
export type DateMode = 'before' | 'after' | 'between'
export type MonthlyDateMode = 'debut_mois' | 'fin_mois' | 'pendant_mois'
export type NumberMode = 'gt' | 'lt' | 'eq' | 'between'
export type CalcOp = 'add' | 'subtract' | 'difference' | 'multiply' | 'divide' | 'ratio'

export interface Filter {
  id: string
  type: FilterType
  columnId: string
  connector: FilterConnector
  matchMode?: TextMatchMode
  terms?: string[]
  values?: string[]
  dateMode?: DateMode | MonthlyDateMode
  date1?: number
  date2?: number
  monthlyDateCompare?: 'avant' | 'apres'
  numberMode?: NumberMode
  num1?: number
  num2?: number
  columnName?: string
}

export interface FilterStack {
  id: string
  name: string
  filters: Filter[]
}

export interface CalcOperand {
  type: 'stack' | 'calc'
  id: string
}

export interface MonthlyCalculation {
  id: string
  name: string
  op: CalcOp
  operands: CalcOperand[]
  stackIds?: string[]
}

export interface DataTable {
  id: string
  name: string
  sourceFileName: string
  columns: Column[]
  rows: DataRow[]
  filterStacks: FilterStack[]
  monthlyFilterStacks: FilterStack[]
  monthlyCalculations: MonthlyCalculation[]
  monthDateColumnId: string
}

export type ImportMode = 'new' | 'append' | 'merge'

export interface ColumnImportConfig {
  sourceIndex: number
  sourceLabel: string
  formatter: ColumnFormatter
  mapToColumnId: string | null
  tempColId?: string
  checked?: boolean
}

export interface PendingImport {
  rows: unknown[][]
  sheetName: string
  fileName: string
}

export type AppView = 'table' | 'info' | 'stats' | 'monthly' | 'values' | 'charts'

export type PeriodMode = 'all' | 'year' | 'month'

export interface PeriodState {
  periodMode: PeriodMode
  year: string
  month: string
}

export interface MatrixSeries {
  id: string
  name: string
  isCalculation: boolean
  op: CalcOp | null
  values: number[]
}

export interface MatrixData {
  months: string[]
  monthLabels: string[]
  series: MatrixSeries[]
}

export interface ImportReport {
  imported: number
  replaced: number
}

export interface TableInfo {
  name: string
  sourceFile: string
  rowCount: number
  colCount: number
  emptyCells: number
  totalCells: number
  columnTypes: { name: string; type: string }[]
  dateColumns: { name: string; min: string; max: string; valid: number }[]
  numberStats: { name: string; min: number | string; max: number | string; valid: number }[]
}
