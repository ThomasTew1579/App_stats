import type { DataTable, FilterStack, MonthlyCalculation } from '@/types'
import { defaultStack, resolveColumnId } from '@/core/filterEngine'
import { getCalcOperands } from '@/core/monthlyEngine'
import { uid } from '@/utils/helpers'

function serializeFilter(f: import('@/types').Filter, table: DataTable) {
  const col = table.columns.find((c) => c.id === f.columnId)
  const { id: _id, ...rest } = f
  return { ...rest, columnName: col?.name ?? '' }
}

function serializeStack(stack: FilterStack, table: DataTable) {
  return {
    name: stack.name,
    filters: (stack.filters ?? []).map((f) => serializeFilter(f, table)),
  }
}

function buildColumnMap(table: DataTable) {
  return table.columns.map((c) => ({
    id: c.id,
    name: c.name,
    sourceKey: c.sourceKey,
    formatter: c.formatter,
  }))
}

export function serializeCalculationForExport(table: DataTable, calc: MonthlyCalculation) {
  const stacks = table.monthlyFilterStacks
  const calcs = table.monthlyCalculations
  const operands = getCalcOperands(calc).map((ref) => {
    if (ref.type === 'stack') {
      const name = stacks.find((s) => s.id === ref.id)?.name
      return name ? { type: 'stack' as const, name } : null
    }
    const name = calcs.find((c) => c.id === ref.id)?.name
    return name ? { type: 'calc' as const, name } : null
  }).filter(Boolean)

  return {
    name: calc.name,
    op: calc.op,
    operands,
    stackNames: operands.filter((o) => o!.type === 'stack').map((o) => o!.name),
  }
}

export function exportFiltersJson(table: DataTable): string {
  const monthDateCol = table.columns.find((c) => c.id === table.monthDateColumnId)
  const payload = {
    version: 2,
    tableName: table.name,
    columns: buildColumnMap(table),
    filterStacks: table.filterStacks.map((s) => serializeStack(s, table)),
    monthlyFilterStacks: (table.monthlyFilterStacks ?? []).map((s) => serializeStack(s, table)),
    monthDateColumnId: table.monthDateColumnId || '',
    monthDateColumnName: monthDateCol?.name ?? '',
    monthlyCalculations: (table.monthlyCalculations ?? []).map((calc) =>
      serializeCalculationForExport(table, calc),
    ),
  }
  return JSON.stringify(payload, null, 2)
}

function importStackFilters(stack: { name?: string; filters?: unknown[] }, table: DataTable): FilterStack {
  return {
    id: uid(),
    name: stack.name || 'Pile importée',
    filters: ((stack.filters ?? []) as Record<string, unknown>[]).map((f) => {
      const { columnName, ...raw } = f
      const filter = {
        ...raw,
        id: uid(),
        connector: (f.connector as import('@/types').FilterConnector) || 'ET',
        columnId: resolveColumnId(table, f.columnId as string, columnName as string),
      } as import('@/types').Filter
      return filter
    }),
  }
}

function importMonthlyConfig(table: DataTable, data: Record<string, unknown>) {
  if (data.monthlyFilterStacks && Array.isArray(data.monthlyFilterStacks)) {
    table.monthlyFilterStacks = data.monthlyFilterStacks.map((s) =>
      importStackFilters(s as { name?: string; filters?: unknown[] }, table),
    )
  }

  if (data.monthDateColumnId || data.monthDateColumnName) {
    table.monthDateColumnId = resolveColumnId(
      table,
      data.monthDateColumnId as string,
      data.monthDateColumnName as string,
    )
  }

  if (data.monthlyCalculations && Array.isArray(data.monthlyCalculations)) {
    const stackNameToId: Record<string, string> = {}
    for (const s of table.monthlyFilterStacks) stackNameToId[s.name] = s.id

    const imported = (data.monthlyCalculations as Record<string, unknown>[]).map((calc) => ({
      id: uid(),
      name: (calc.name as string) || 'Calcul',
      op: (calc.op as import('@/types').CalcOp) || 'add',
      rawOperands: (calc.operands as { type: string; name: string }[])
        ?? ((calc.stackNames as string[]) ?? []).map((n) => ({ type: 'stack', name: n })),
    }))

    const calcNameToId: Record<string, string> = {}
    for (const c of imported) calcNameToId[c.name] = c.id

    table.monthlyCalculations = imported.map((c) => ({
      id: c.id,
      name: c.name,
      op: c.op,
      operands: (c.rawOperands ?? []).map((op) => {
        if (op.type === 'calc') {
          const id = calcNameToId[op.name]
          return id ? { type: 'calc' as const, id } : null
        }
        const id = stackNameToId[op.name]
        return id ? { type: 'stack' as const, id } : null
      }).filter(Boolean) as import('@/types').CalcOperand[],
    }))
  }
}

export function importFiltersJson(table: DataTable, jsonStr: string): void {
  const data = JSON.parse(jsonStr) as Record<string, unknown>

  if ((data.version as number) >= 2) {
    if (data.filterStacks && Array.isArray(data.filterStacks)) {
      table.filterStacks = data.filterStacks.map((s) =>
        importStackFilters(s as { name?: string; filters?: unknown[] }, table),
      )
    }
    importMonthlyConfig(table, data)
  } else if (data.stacks && Array.isArray(data.stacks)) {
    table.filterStacks = data.stacks.map((s) =>
      importStackFilters(s as { name?: string; filters?: unknown[] }, table),
    )
  } else {
    throw new Error('Format invalide')
  }
}

export { defaultStack }
