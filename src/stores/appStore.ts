import { defineStore } from 'pinia'
import { computed, ref, shallowRef, triggerRef } from 'vue'
import type {
  AppView, ColumnImportConfig, DataTable, FilterType, ImportReport, PendingImport,
  PeriodState, ColumnFormatter,
} from '@/types'
import { applyFormatter } from '@/core/formatters'
import { defaultFilter, defaultStack } from '@/core/filterEngine'
import { defaultCalculation, ensureMonthlyConfig } from '@/core/monthlyEngine'
import { exportFiltersJson, importFiltersJson } from '@/core/filterImportExport'
import { exportPdfReport } from '@/core/pdfExport'
import { drawChart, type ChartConfig } from '@/core/chartRenderer'
import { buildMatrixData, getAvailableMonths, clearMatrixCache, getChartSeriesList } from '@/core/monthlyEngine'
import { DEFAULT_CHART_COLORS, uid } from '@/utils/helpers'
import { getDataRows, getHeadersFromRows } from '@/core/xlsxParser'

export const useAppStore = defineStore('app', () => {
  const tables = shallowRef<DataTable[]>([])
  const activeTableId = ref<string | null>(null)
  const activeView = ref<AppView>('table')
  const pendingImport = ref<PendingImport | null>(null)

  const showImportModal = ref(false)
  const showColumnModal = ref(false)
  const showFilterImportModal = ref(false)
  const showDetailModal = ref(false)
  const showDatetimeModal = ref(false)

  const importMode = ref<'new' | 'append' | 'merge'>('new')
  const targetTableId = ref('')
  const idColumnIndex = ref(0)
  const headerRowIndex = ref(0)
  const columnConfigs = ref<ColumnImportConfig[]>([])
  const importWarnings = ref<string[]>([])
  const importReport = ref<ImportReport | null>(null)

  const valuesPeriod = ref<PeriodState>({ periodMode: 'all', year: '', month: '' })
  const pdfRowSelection = ref<Record<string, boolean>>({})

  const chartPeriod = ref<PeriodState>({ periodMode: 'year', year: '', month: '' })
  const chartType = ref<'column' | 'line' | 'pie'>('column')
  const chartColumnLayout = ref<'grouped' | 'stacked'>('grouped')
  const chartStackConfig = ref<Record<string, { selected: boolean; color: string }>>({})
  const lastChartTableId = ref<string | null>(null)
  const chartCanvasRef = ref<HTMLCanvasElement | null>(null)

  const detailTitle = ref('')
  const detailHtml = ref('')

  const datetimeCallback = ref<((ts: number) => void) | null>(null)
  const datetimeInitial = ref(Date.now())

  const activeTable = computed(() =>
    tables.value.find((t) => t.id === activeTableId.value) ?? null,
  )

  /** Mise à jour immuable — nécessaire avec shallowRef pour déclencher le rendu Vue */
  function updateTable(tableId: string, updater: (table: DataTable) => DataTable) {
    tables.value = tables.value.map((t) => (t.id === tableId ? updater(t) : t))
    clearMatrixCache()
  }

  function setActiveTable(id: string) {
    activeTableId.value = id
  }

  function setActiveView(view: AppView) {
    activeView.value = view
  }

  function deleteTable(id: string) {
    const idx = tables.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    const next = [...tables.value]
    next.splice(idx, 1)
    tables.value = next
    clearMatrixCache()
    if (activeTableId.value === id) {
      activeTableId.value = next[0]?.id ?? null
    }
  }

  function renameTable(id: string, name: string) {
    const table = tables.value.find((t) => t.id === id)
    if (table) {
      table.name = name
      triggerRef(tables)
    }
  }

  function openImport(pending: PendingImport) {
    pendingImport.value = pending
    importMode.value = 'new'
    headerRowIndex.value = 0
    importWarnings.value = []
    importReport.value = null
    refreshColumnConfigs()
    showImportModal.value = true
  }

  function refreshColumnConfigs() {
    if (!pendingImport.value) return
    const headers = getHeadersFromRows(pendingImport.value.rows, headerRowIndex.value)
    columnConfigs.value = headers.map((h) => ({
      sourceIndex: h.index,
      sourceLabel: h.label,
      formatter: { type: 'none' as const },
      mapToColumnId: null,
      checked: true,
    }))
    if (tables.value.length && !targetTableId.value) {
      targetTableId.value = tables.value[0].id
    }
  }

  function executeImport() {
    if (!pendingImport.value) return
    const { rows, fileName } = pendingImport.value
    const dataRows = getDataRows(rows, headerRowIndex.value)
    const configs = columnConfigs.value.filter((c) => c.checked !== false)

    if (configs.length === 0) {
      alert('Sélectionnez au moins une colonne.')
      return
    }

    const warnings: string[] = []
    let report: ImportReport | null = null

    for (const cfg of configs) {
      cfg.tempColId = uid()
    }

    const processedRows = dataRows.map((row) => {
      const rowData: Record<string, unknown> = {}
      for (const cfg of configs) {
        const raw = row[cfg.sourceIndex]
        if (cfg.formatter.type !== 'none') {
          const result = applyFormatter(raw, cfg.formatter)
          if (result.warning) warnings.push(result.warning)
          rowData[cfg.tempColId!] = result.rawTs != null ? result.rawTs : result.value
        } else {
          rowData[cfg.tempColId!] = raw ?? ''
        }
      }
      return rowData
    })

    const mode = importMode.value

    if (mode === 'new') {
      const table: DataTable = {
        id: uid(),
        name: fileName.replace(/\.(xlsx|xls)$/i, '') || 'Nouveau tableau',
        sourceFileName: fileName,
        columns: configs.map((cfg) => ({
          id: cfg.tempColId!,
          name: cfg.sourceLabel,
          sourceKey: cfg.sourceLabel,
          formatter: { ...cfg.formatter },
        })),
        rows: processedRows.map((data) => ({ id: uid(), data })),
        filterStacks: [],
        monthlyFilterStacks: [],
        monthlyCalculations: [],
        monthDateColumnId: '',
      }
      tables.value = [...tables.value, table]
      activeTableId.value = table.id
      clearMatrixCache()
      report = { imported: processedRows.length, replaced: 0 }
    } else {
      const target = tables.value.find((t) => t.id === targetTableId.value)
      if (!target) {
        alert('Sélectionnez un tableau cible.')
        return
      }

      for (const cfg of configs) {
        if (cfg.mapToColumnId) {
          cfg.tempColId = cfg.mapToColumnId
          const existingCol = target.columns.find((c) => c.id === cfg.mapToColumnId)
          if (existingCol && cfg.formatter.type !== 'none') {
            existingCol.formatter = { ...cfg.formatter }
          }
        } else {
          target.columns.push({
            id: cfg.tempColId!,
            name: cfg.sourceLabel,
            sourceKey: cfg.sourceLabel,
            formatter: { ...cfg.formatter },
          })
        }
      }

      if (mode === 'append') {
        for (const data of processedRows) {
          target.rows.push({ id: uid(), data })
        }
        report = { imported: processedRows.length, replaced: 0 }
      } else if (mode === 'merge') {
        const idConfig = configs.find((c) => c.sourceIndex === idColumnIndex.value)
        if (!idConfig) {
          alert('La colonne ID doit être sélectionnée dans les colonnes à importer.')
          return
        }
        const idColId = idConfig.tempColId!
        let imported = 0
        let replaced = 0

        for (const data of processedRows) {
          const rowId = String(data[idColId] ?? '')
          const existing = target.rows.find((r) => String(r.data[idColId] ?? '') === rowId)
          if (existing && rowId !== '') {
            Object.assign(existing.data, data)
            replaced++
          } else {
            target.rows.push({ id: uid(), data })
            imported++
          }
        }
        report = { imported, replaced }
      }

      activeTableId.value = target.id
      clearMatrixCache()
      triggerRef(tables)
    }

    importWarnings.value = [...new Set(warnings)]
    importReport.value = report

    if (report) {
      setTimeout(() => {
        showImportModal.value = false
        pendingImport.value = null
      }, report.replaced || warnings.length ? 2000 : 300)
    }
  }

  function saveColumnSettings(updates: { colId: string; name: string; formatter: ColumnFormatter }[]) {
    const table = activeTable.value
    if (!table) return
    const warnings: string[] = []

    for (const upd of updates) {
      const col = table.columns.find((c) => c.id === upd.colId)
      if (!col) continue
      col.name = upd.name
      col.formatter = { ...upd.formatter }
      for (const row of table.rows) {
        const raw = row.data[col.id]
        if (upd.formatter.type !== 'none' && raw != null && raw !== '') {
          const result = applyFormatter(raw, col.formatter)
          if (result.warning) warnings.push(result.warning)
        }
      }
    }

    clearMatrixCache()
    triggerRef(tables)
    showColumnModal.value = false
    if (warnings.length > 0) {
      alert('Avertissements lors du reformatage :\n' + [...new Set(warnings)].slice(0, 10).join('\n'))
    }
  }

  function addFilterStack(monthly = false) {
    const table = activeTable.value
    if (!table) return
    updateTable(table.id, (t) => {
      const base = monthly ? ensureMonthlyConfig({ ...t, monthlyFilterStacks: [...(t.monthlyFilterStacks ?? [])], monthlyCalculations: [...(t.monthlyCalculations ?? [])] }) : t
      if (monthly) {
        return { ...base, monthlyFilterStacks: [...base.monthlyFilterStacks, defaultStack()] }
      }
      return { ...t, filterStacks: [...t.filterStacks, defaultStack()] }
    })
  }

  function addMonthlyCalculation() {
    const table = activeTable.value
    if (!table) return
    updateTable(table.id, (t) => {
      const base = ensureMonthlyConfig({ ...t, monthlyFilterStacks: [...(t.monthlyFilterStacks ?? [])], monthlyCalculations: [...(t.monthlyCalculations ?? [])] })
      return { ...base, monthlyCalculations: [...base.monthlyCalculations, defaultCalculation()] }
    })
  }

  function removeFilterStack(
    tableId: string,
    stacksKey: 'filterStacks' | 'monthlyFilterStacks',
    stackId: string,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      [stacksKey]: t[stacksKey].filter((s) => s.id !== stackId),
    }))
  }

  function addFilterToStack(
    tableId: string,
    stacksKey: 'filterStacks' | 'monthlyFilterStacks',
    stackId: string,
    type: FilterType,
    monthlyContext: boolean,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      [stacksKey]: t[stacksKey].map((s) =>
        s.id !== stackId
          ? s
          : { ...s, filters: [...s.filters, defaultFilter(type, t, monthlyContext)] },
      ),
    }))
  }

  function removeFilterFromStack(
    tableId: string,
    stacksKey: 'filterStacks' | 'monthlyFilterStacks',
    stackId: string,
    filterId: string,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      [stacksKey]: t[stacksKey].map((s) =>
        s.id !== stackId ? s : { ...s, filters: s.filters.filter((f) => f.id !== filterId) },
      ),
    }))
  }

  function moveFilterInStack(
    tableId: string,
    stacksKey: 'filterStacks' | 'monthlyFilterStacks',
    stackId: string,
    filterId: string,
    dir: -1 | 1,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      [stacksKey]: t[stacksKey].map((s) => {
        if (s.id !== stackId) return s
        const i = s.filters.findIndex((f) => f.id === filterId)
        const j = i + dir
        if (i < 0 || j < 0 || j >= s.filters.length) return s
        const filters = [...s.filters]
        ;[filters[i], filters[j]] = [filters[j], filters[i]]
        return { ...s, filters }
      }),
    }))
  }

  function updateFilterDate(
    tableId: string,
    stacksKey: 'filterStacks' | 'monthlyFilterStacks',
    stackId: string,
    filterId: string,
    field: 'date1' | 'date2',
    ts: number,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      [stacksKey]: t[stacksKey].map((s) =>
        s.id !== stackId
          ? s
          : {
              ...s,
              filters: s.filters.map((f) => (f.id !== filterId ? f : { ...f, [field]: ts })),
            },
      ),
    }))
  }

  function removeMonthlyCalculation(tableId: string, calcId: string) {
    updateTable(tableId, (t) => ({
      ...t,
      monthlyCalculations: t.monthlyCalculations.filter((c) => c.id !== calcId),
    }))
  }

  function patchMonthlyCalculation(
    tableId: string,
    calcId: string,
    patch: Partial<import('@/types').MonthlyCalculation>,
  ) {
    updateTable(tableId, (t) => ({
      ...t,
      monthlyCalculations: t.monthlyCalculations.map((c) =>
        c.id !== calcId ? c : { ...c, ...patch },
      ),
    }))
  }

  async function copyFiltersJson() {
    const table = activeTable.value
    if (!table) return
    const json = exportFiltersJson(table)
    try {
      await navigator.clipboard.writeText(json)
      alert('Configuration des filtres (courant + mensuel) copiée dans le presse-papiers.')
    } catch {
      prompt('Copiez ce JSON :', json)
    }
  }

  function importFilters(jsonStr: string) {
    const table = activeTable.value
    if (!table) return
    try {
      importFiltersJson(table, jsonStr)
      clearMatrixCache()
      triggerRef(tables)
      showFilterImportModal.value = false
    } catch (err) {
      alert('Erreur d\'import : ' + (err as Error).message)
    }
  }

  function applyChartDefaults() {
    const table = activeTable.value
    if (!table || table.id === lastChartTableId.value) return
    lastChartTableId.value = table.id
    chartStackConfig.value = {}
    const months = getAvailableMonths(table)
    const years = [...new Set(months.map((k) => k.split('-')[0]))].sort()
    chartPeriod.value = {
      periodMode: 'year',
      year: years[years.length - 1] || years[0] || '',
      month: months[months.length - 1] || months[0] || '',
    }
  }

  function ensureChartStackConfig() {
    const table = activeTable.value
    if (!table) return
    const seriesList = getChartSeriesList(table)
    const firstFilterId = seriesList.find((s) => !s.isCalculation)?.id
    const config = { ...chartStackConfig.value }
    seriesList.forEach((series, i) => {
      if (!config[series.id]) {
        config[series.id] = {
          selected: series.id === firstFilterId,
          color: DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length],
        }
      }
    })
    for (const id of Object.keys(config)) {
      if (!seriesList.find((s) => s.id === id)) delete config[id]
    }
    chartStackConfig.value = config
  }

  function getChartConfig(): ChartConfig {
    return {
      chartType: chartType.value,
      columnLayout: chartColumnLayout.value,
      stackConfig: chartStackConfig.value,
    }
  }

  function drawActiveChart(exportImage = false): string | null {
    const table = activeTable.value
    const canvas = chartCanvasRef.value
    if (!table || !canvas) return null
    const matrix = buildMatrixData(table, chartPeriod.value)
    const selected = matrix.series.filter((s) => chartStackConfig.value[s.id]?.selected !== false)
    return drawChart(canvas, matrix, selected, getChartConfig(), { exportImage })
  }

  function exportPdf() {
    const table = activeTable.value
    if (!table || !table.rows.length) {
      alert('Aucun tableau à exporter.')
      return
    }
    const chartImg = drawActiveChart(true) ?? ''
    const matrix = buildMatrixData(table, valuesPeriod.value)
    const selectedIds = new Set(
      matrix.series
        .filter((s) => pdfRowSelection.value[s.id] !== false)
        .map((s) => s.id),
    )
    exportPdfReport(table, valuesPeriod.value, selectedIds, chartImg)
  }

  function openDatetimePicker(initialTs: number, callback: (ts: number) => void) {
    datetimeInitial.value = initialTs
    datetimeCallback.value = callback
    showDatetimeModal.value = true
  }

  function confirmDatetime(ts: number) {
    datetimeCallback.value?.(ts)
    showDatetimeModal.value = false
    datetimeCallback.value = null
  }

  function openDetail(title: string, html: string) {
    detailTitle.value = title
    detailHtml.value = html
    showDetailModal.value = true
  }

  function togglePdfRow(seriesId: string, checked: boolean) {
    pdfRowSelection.value = { ...pdfRowSelection.value, [seriesId]: checked }
  }

  function isPdfRowSelected(seriesId: string): boolean {
    if (pdfRowSelection.value[seriesId] === undefined) return true
    return pdfRowSelection.value[seriesId] !== false
  }

  return {
    tables,
    activeTableId,
    activeView,
    activeTable,
    pendingImport,
    showImportModal,
    showColumnModal,
    showFilterImportModal,
    showDetailModal,
    showDatetimeModal,
    importMode,
    targetTableId,
    idColumnIndex,
    headerRowIndex,
    columnConfigs,
    importWarnings,
    importReport,
    valuesPeriod,
    pdfRowSelection,
    chartPeriod,
    chartType,
    chartColumnLayout,
    chartStackConfig,
    chartCanvasRef,
    detailTitle,
    detailHtml,
    datetimeInitial,
    setActiveTable,
    setActiveView,
    deleteTable,
    renameTable,
    openImport,
    refreshColumnConfigs,
    executeImport,
    saveColumnSettings,
    addFilterStack,
    addMonthlyCalculation,
    removeFilterStack,
    addFilterToStack,
    removeFilterFromStack,
    moveFilterInStack,
    updateFilterDate,
    removeMonthlyCalculation,
    patchMonthlyCalculation,
    updateTable,
    copyFiltersJson,
    importFilters,
    applyChartDefaults,
    ensureChartStackConfig,
    drawActiveChart,
    exportPdf,
    openDatetimePicker,
    confirmDatetime,
    openDetail,
    togglePdfRow,
    isPdfRowSelected,
  }
})
