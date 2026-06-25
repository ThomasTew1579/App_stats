import type {
  CalcOp, DataTable, MatrixData, MonthlyCalculation, PeriodState,
} from '@/types'
import { applyStack } from '@/core/filterEngine'
import { getCellRawForFilter } from '@/core/formatters'
import { formatMonthLabel, uid } from '@/utils/helpers'

export const CALC_OPS = [
  { value: 'add' as const, label: 'Addition', nary: true },
  { value: 'subtract' as const, label: 'Soustraction', nary: false },
  { value: 'difference' as const, label: 'Différence (|A − B|)', nary: false },
  { value: 'multiply' as const, label: 'Multiplication', nary: true },
  { value: 'divide' as const, label: 'Division (A ÷ B)', nary: false },
  { value: 'ratio' as const, label: 'Ratio (A / B × 100)', nary: false },
]

export function ensureMonthlyConfig(table: DataTable): DataTable {
  if (!table.monthlyFilterStacks) table.monthlyFilterStacks = []
  if (!table.monthlyCalculations) table.monthlyCalculations = []
  if (!table.monthDateColumnId) {
    const d = table.columns.find((c) => c.formatter?.type === 'date')
    table.monthDateColumnId = d?.id ?? ''
  }
  return table
}

export function getCalcOperands(calc: MonthlyCalculation) {
  if (calc.operands?.length) return calc.operands
  if (calc.stackIds?.length) return calc.stackIds.map((id) => ({ type: 'stack' as const, id }))
  return []
}

export function getRowMonthKey(row: { data: Record<string, unknown> }, table: DataTable): string | null {
  const col = table.columns.find((c) => c.id === table.monthDateColumnId)
  if (!col) return null
  const raw = getCellRawForFilter(row as import('@/types').DataRow, col)
  if (raw == null || isNaN(Number(raw))) return null
  const d = new Date(Number(raw))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getAvailableMonths(table: DataTable): string[] {
  const cacheKey = `${table.id}:${table.rows.length}:${table.monthDateColumnId}`
  const cached = monthsCache.get(cacheKey)
  if (cached) return cached

  const set = new Set<string>()
  for (const row of table.rows) {
    const k = getRowMonthKey(row, table)
    if (k) set.add(k)
  }
  const result = [...set].sort()
  monthsCache.set(cacheKey, result)
  if (monthsCache.size > 16) {
    const first = monthsCache.keys().next().value
    if (first) monthsCache.delete(first)
  }
  return result
}

const monthsCache = new Map<string, string[]>()

export function getChartSeriesList(table: DataTable) {
  ensureMonthlyConfig(table)
  return [
    ...table.monthlyFilterStacks.map((s) => ({ id: s.id, name: s.name, isCalculation: false })),
    ...table.monthlyCalculations.map((c) => ({ id: c.id, name: c.name, isCalculation: true })),
  ]
}

function buildRowsByMonthIndex(table: DataTable): Map<string, import('@/types').DataRow[]> {
  const map = new Map<string, import('@/types').DataRow[]>()
  for (const row of table.rows) {
    const mk = getRowMonthKey(row, table)
    if (!mk) continue
    const bucket = map.get(mk)
    if (bucket) bucket.push(row as import('@/types').DataRow)
    else map.set(mk, [row as import('@/types').DataRow])
  }
  return map
}

function stackCountForMonth(
  table: DataTable,
  stack: import('@/types').FilterStack,
  monthKey: string,
  rowsByMonth: Map<string, import('@/types').DataRow[]>,
): number {
  const context = { monthKey, monthlyContext: true }
  const hasDateFilter = stack.filters.some((f) => f.type === 'date')
  if (hasDateFilter) {
    return applyStack(table.rows, stack, table, context).length
  }
  const monthRows = rowsByMonth.get(monthKey) ?? []
  return applyStack(monthRows, stack, table, context).length
}

function matrixCacheKey(table: DataTable, periodState: PeriodState): string {
  return `${table.id}|${table.rows.length}|${periodState.periodMode}|${periodState.year}|${periodState.month}|${table.monthDateColumnId}|${table.monthlyFilterStacks.length}|${table.monthlyCalculations.length}`
}

const matrixCache = new Map<string, MatrixData>()

export function clearMatrixCache() {
  matrixCache.clear()
  monthsCache.clear()
}

export function getRowsForMonth(table: DataTable, monthKey: string) {
  return table.rows.filter((row) => getRowMonthKey(row, table) === monthKey)
}

export function computeStackCellData(table: DataTable, stack: import('@/types').FilterStack, monthKey: string) {
  if (!stack?.filters) return { count: 0, rows: [] as import('@/types').DataRow[] }
  const context = { monthKey, monthlyContext: true }
  const hasDateFilter = stack.filters.some((f) => f.type === 'date')

  if (hasDateFilter) {
    const filtered = applyStack(table.rows, stack, table, context)
    return { count: filtered.length, rows: filtered }
  }

  const monthRows = getRowsForMonth(table, monthKey)
  const filtered = applyStack(monthRows, stack, table, context)
  return { count: filtered.length, rows: filtered }
}

function applyCalcOp(op: CalcOp, values: number[]): number | null {
  const nums = values.map((v) => Number(v) || 0)
  if (nums.length === 0) return null

  switch (op) {
    case 'add': return nums.reduce((a, b) => a + b, 0)
    case 'subtract': return nums.length >= 2 ? nums[0] - nums[1] : nums[0]
    case 'difference': return nums.length >= 2 ? Math.abs(nums[0] - nums[1]) : Math.abs(nums[0])
    case 'multiply': return nums.reduce((a, b) => a * b, 1)
    case 'divide': return nums.length >= 2 && nums[1] !== 0 ? nums[0] / nums[1] : null
    case 'ratio': return nums.length >= 2 && nums[1] !== 0 ? (nums[0] / nums[1]) * 100 : null
    default: return null
  }
}

function resolveOperandValue(
  table: DataTable,
  ref: { type: 'stack' | 'calc'; id: string },
  monthKey: string,
  calcIndex: number,
  memo: Record<string, number>,
): number | null {
  if (ref.type === 'stack') {
    const stack = table.monthlyFilterStacks.find((s) => s.id === ref.id)
    return stack ? computeStackCellData(table, stack, monthKey).count : 0
  }
  if (ref.type === 'calc') {
    const calcs = table.monthlyCalculations
    const otherIndex = calcs.findIndex((c) => c.id === ref.id)
    if (otherIndex < 0 || otherIndex >= calcIndex) return null
    if (memo[ref.id] !== undefined) return memo[ref.id]
    const { value } = computeCalculation(table, calcs[otherIndex], monthKey, memo)
    return value
  }
  return null
}

export function computeCalculation(
  table: DataTable,
  calc: MonthlyCalculation,
  monthKey: string,
  memo: Record<string, number> = {},
) {
  const calcs = table.monthlyCalculations
  const calcIndex = calcs.findIndex((c) => c.id === calc.id)
  const operands = getCalcOperands(calc)
  const operandDetails = operands.map((ref) => ({
    ref,
    value: resolveOperandValue(table, ref, monthKey, calcIndex, memo),
  }))
  const values = operandDetails.map((d) => d.value)
  if (values.some((v) => v === null)) {
    return { value: null as number | null, operandDetails, operands }
  }
  const value = applyCalcOp(calc.op, values as number[])
  if (value != null) memo[calc.id] = value
  return { value, operandDetails, operands }
}

export function formatCalcDisplay(value: number | null, op: CalcOp): string {
  if (value == null || isNaN(value)) return '—'
  if (op === 'ratio') return `${value.toFixed(1)} %`
  if (op === 'divide') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

export function getVisibleMonthsForState(table: DataTable, state: PeriodState): string[] {
  const all = getAvailableMonths(table)
  if (state.periodMode === 'year' && state.year) {
    return all.filter((k) => k.startsWith(state.year + '-'))
  }
  if (state.periodMode === 'month' && state.month) {
    return all.filter((k) => k === state.month)
  }
  return all
}

export function buildMatrixData(table: DataTable, periodState: PeriodState): MatrixData {
  const key = matrixCacheKey(table, periodState)
  const hit = matrixCache.get(key)
  if (hit) return hit

  ensureMonthlyConfig(table)
  const months = getVisibleMonthsForState(table, periodState)
  const rowsByMonth = buildRowsByMonthIndex(table)

  const filterSeries = table.monthlyFilterStacks.map((stack) => ({
    id: stack.id,
    name: stack.name,
    isCalculation: false,
    op: null as CalcOp | null,
    values: months.map((mk) => stackCountForMonth(table, stack, mk, rowsByMonth)),
  }))
  const calcSeries = table.monthlyCalculations.map((calc) => ({
    id: calc.id,
    name: calc.name,
    isCalculation: true,
    op: calc.op,
    values: months.map((mk) => {
      const { value } = computeCalculation(table, calc, mk)
      return value ?? 0
    }),
  }))
  const result: MatrixData = {
    months,
    monthLabels: months.map(formatMonthLabel),
    series: [...filterSeries, ...calcSeries],
  }
  matrixCache.set(key, result)
  if (matrixCache.size > 12) {
    const first = matrixCache.keys().next().value
    if (first) matrixCache.delete(first)
  }
  return result
}

export function defaultCalculation(): MonthlyCalculation {
  return {
    id: uid(),
    name: 'Calcul',
    op: 'add',
    operands: [],
  }
}

export function isNaryOp(op: CalcOp): boolean {
  return CALC_OPS.find((o) => o.value === op)?.nary === true
}

export function getOperandLabel(table: DataTable, ref: { type: 'stack' | 'calc'; id: string }): string {
  if (ref.type === 'stack') {
    return table.monthlyFilterStacks.find((s) => s.id === ref.id)?.name ?? 'Pile ?'
  }
  return table.monthlyCalculations.find((c) => c.id === ref.id)?.name ?? 'Calcul ?'
}

export { formatMonthLabel }
