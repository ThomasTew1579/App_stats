<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import {
  buildMatrixData, computeStackCellData, computeCalculation,
  formatCalcDisplay, formatMonthLabel, getAvailableMonths, ensureMonthlyConfig,
  getOperandLabel,
} from '@/core/monthlyEngine'
import { formatCellValue } from '@/core/formatters'
import { escapeHtml } from '@/utils/helpers'
import { CALC_OPS } from '@/core/monthlyEngine'

const store = useAppStore()
const { activeTable, valuesPeriod } = storeToRefs(store)

const table = computed(() => {
  if (activeTable.value) ensureMonthlyConfig(activeTable.value)
  return activeTable.value
})

const years = computed(() => {
  const months = table.value ? getAvailableMonths(table.value) : []
  return [...new Set(months.map((k) => k.split('-')[0]))].sort()
})

const allMonths = computed(() => table.value ? getAvailableMonths(table.value) : [])

const matrix = computed(() =>
  table.value ? buildMatrixData(table.value, valuesPeriod.value) : null,
)

watch([table, allMonths], () => {
  if (!valuesPeriod.value.year && years.value.length) {
    valuesPeriod.value.year = years.value[0]
  }
  if (!valuesPeriod.value.month && allMonths.value.length) {
    valuesPeriod.value.month = allMonths.value[0]
  }
}, { immediate: true })

function openStackDetail(stackId: string, monthKey: string) {
  const t = table.value
  if (!t) return
  const stack = t.monthlyFilterStacks.find((s) => s.id === stackId)
  if (!stack) return
  const { rows } = computeStackCellData(t, stack, monthKey)
  let html = '<div class="filter-result-wrapper"><table class="filter-result-table"><thead><tr>'
  for (const col of t.columns) html += `<th>${escapeHtml(col.name)}</th>`
  html += '</tr></thead><tbody>'
  for (const row of rows) {
    html += '<tr>'
    for (const col of t.columns) html += `<td>${escapeHtml(String(formatCellValue(row, col) ?? ''))}</td>`
    html += '</tr>'
  }
  html += '</tbody></table></div>'
  store.openDetail(`${stack.name} — ${formatMonthLabel(monthKey)} (${rows.length} ligne(s))`, html)
}

function openCalcDetail(calcId: string, monthKey: string) {
  const t = table.value
  if (!t) return
  const calc = t.monthlyCalculations.find((c) => c.id === calcId)
  if (!calc) return
  const { value, operandDetails } = computeCalculation(t, calc, monthKey)
  const opLabel = CALC_OPS.find((o) => o.value === calc.op)?.label ?? calc.op
  let html = `<p><strong>${escapeHtml(calc.name)}</strong> — ${formatMonthLabel(monthKey)}</p>`
  html += `<p>Opération : ${escapeHtml(opLabel)}</p><ul class="calc-detail-list">`
  for (const { ref, value: v } of operandDetails) {
    const label = getOperandLabel(t, ref)
    const prefix = ref.type === 'calc' ? 'Calcul ' : 'Pile '
    const otherCalc = ref.type === 'calc' ? t.monthlyCalculations.find((c) => c.id === ref.id) : null
    const valDisplay = ref.type === 'calc'
      ? formatCalcDisplay(v, otherCalc?.op ?? 'add')
      : `<strong>${v ?? 0}</strong> ligne(s)`
    html += `<li>${prefix}${escapeHtml(label)} : ${valDisplay}</li>`
  }
  html += `</ul><p>Résultat : <strong>${formatCalcDisplay(value, calc.op)}</strong></p>`
  store.openDetail(`${calc.name} — ${formatMonthLabel(monthKey)}`, html)
}
</script>

<template>
  <section id="view-values">
    <div class="stats-panel">
      <header class="stats-header">
        <h2>Valeur des statistiques — <span>{{ table?.name ?? '—' }}</span></h2>
      </header>
      <div class="values-toolbar">
        <div class="form-group">
          <label>Affichage</label>
          <select v-model="valuesPeriod.periodMode">
            <option value="all">Totalité des dates</option>
            <option value="year">Par année</option>
            <option value="month">Par mois</option>
          </select>
        </div>
        <div v-show="valuesPeriod.periodMode === 'year'" class="form-group">
          <label>Année</label>
          <select v-model="valuesPeriod.year">
            <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <div v-show="valuesPeriod.periodMode === 'month'" class="form-group">
          <label>Mois</label>
          <select v-model="valuesPeriod.month">
            <option v-for="m in allMonths" :key="m" :value="m">{{ formatMonthLabel(m) }}</option>
          </select>
        </div>
      </div>
      <p v-if="!table?.rows.length" class="empty-state">Aucune donnée disponible.</p>
      <p v-else-if="!matrix?.series.length || !matrix.months.length || !table.monthDateColumnId" class="filter-hint">
        Configurez une colonne date et des piles dans « Filtre mensuel ».
      </p>
      <div v-else class="values-matrix-wrapper">
        <table class="values-matrix">
          <thead>
            <tr>
              <th>Pile</th>
              <th class="values-pdf-col" title="Inclure dans le rapport PDF">PDF</th>
              <th v-for="m in matrix.months" :key="m">{{ formatMonthLabel(m) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="series in matrix.series" :key="series.id" :class="{ 'calc-row': series.isCalculation }">
              <th>{{ series.name }}{{ series.isCalculation ? ' ƒ' : '' }}</th>
              <td class="values-pdf-col">
                <input
                  type="checkbox"
                  :checked="store.isPdfRowSelected(series.id)"
                  title="Inclure dans le rapport PDF"
                  @change="store.togglePdfRow(series.id, ($event.target as HTMLInputElement).checked)"
                >
              </td>
              <td v-for="(monthKey, mi) in matrix.months" :key="monthKey">
                <button
                  type="button"
                  class="values-cell-btn"
                  :title="'Voir le détail'"
                  @click="series.isCalculation ? openCalcDetail(series.id, monthKey) : openStackDetail(series.id, monthKey)"
                >
                  {{ series.isCalculation ? formatCalcDisplay(series.values[mi], series.op!) : series.values[mi] }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
