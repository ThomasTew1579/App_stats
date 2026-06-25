<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MonthlyCalculation } from '@/types'
import { CALC_OPS, ensureMonthlyConfig, getCalcOperands, isNaryOp } from '@/core/monthlyEngine'
import { useAppStore } from '@/stores/appStore'
import FilterStackPanel from '@/components/FilterStackPanel.vue'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { activeTable } = storeToRefs(store)
const collapsedCalcs = ref<Record<string, boolean>>({})

const table = computed(() => {
  if (activeTable.value) ensureMonthlyConfig(activeTable.value)
  return activeTable.value
})

const dateColumns = computed(() =>
  table.value?.columns.filter((c) => c.formatter?.type === 'date') ?? [],
)

function getPreviousCalcs(calcIndex: number) {
  return (table.value?.monthlyCalculations ?? []).slice(0, calcIndex)
}

function isOperandSelected(calc: MonthlyCalculation, type: string, id: string) {
  return getCalcOperands(calc).some((o) => o.type === type && o.id === id)
}

function toggleNaryOperand(calc: MonthlyCalculation, type: 'stack' | 'calc', id: string, checked: boolean) {
  const ops = getCalcOperands(calc)
  const operands = checked
    ? [...ops, { type, id }]
    : ops.filter((o) => !(o.type === type && o.id === id))
  store.patchMonthlyCalculation(table.value!.id, calc.id, { operands })
}

function setBinaryOperand(calc: MonthlyCalculation, index: number, val: string) {
  const ops = [...getCalcOperands(calc)]
  const parsed = parseOperand(val)
  if (parsed) ops[index] = parsed
  else ops.splice(index, 1)
  store.patchMonthlyCalculation(table.value!.id, calc.id, { operands: ops.filter(Boolean) as import('@/types').CalcOperand[] })
}

function parseOperand(val: string) {
  if (!val) return null
  const idx = val.indexOf(':')
  if (idx === -1) return { type: 'stack' as const, id: val }
  return { type: val.slice(0, idx) as 'stack' | 'calc', id: val.slice(idx + 1) }
}

function formatOperand(ref: { type: string; id: string }) {
  return `${ref.type}:${ref.id}`
}

function onOpChange(calc: MonthlyCalculation, op: import('@/types').CalcOp) {
  store.patchMonthlyCalculation(table.value!.id, calc.id, { op, operands: [] })
}

function patchCalcName(calcId: string, name: string) {
  store.patchMonthlyCalculation(table.value!.id, calcId, { name })
}

function onMonthDateChange(columnId: string) {
  if (!table.value) return
  store.updateTable(table.value.id, (t) => ({ ...t, monthDateColumnId: columnId }))
}
</script>

<template>
  <section id="view-monthly">
    <div class="stats-panel">
      <header class="stats-header">
        <h2>Filtre mensuel — <span>{{ table?.name ?? '—' }}</span></h2>
        <div class="stats-actions">
          <button type="button" class="btn btn-primary" @click="store.addFilterStack(true)">+ Nouvelle pile</button>
          <button type="button" class="btn btn-secondary" @click="store.addMonthlyCalculation()">+ Fonction de calcul</button>
          <button type="button" class="btn btn-secondary" @click="store.copyFiltersJson()">Exporter JSON</button>
          <button type="button" class="btn btn-secondary" @click="store.showFilterImportModal = true">Importer JSON</button>
        </div>
      </header>
      <div v-if="table" class="form-group monthly-date-select">
        <label for="month-date-column">Colonne date (répartition par mois)</label>
        <select
          id="month-date-column"
          :value="table.monthDateColumnId"
          @change="onMonthDateChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="c in dateColumns" :key="c.id" :value="c.id">{{ c.name }}</option>
          <option v-if="!dateColumns.length" value="">— Aucune colonne date —</option>
        </select>
      </div>
      <p v-if="!table?.rows.length" class="empty-state">Aucune donnée. Importez un tableau d'abord.</p>
      <div v-else class="stats-stacks">
        <FilterStackPanel
          v-for="stack in table.monthlyFilterStacks"
          :key="stack.id"
          :stack="stack"
          :table-id="table.id"
          stacks-key="monthlyFilterStacks"
          :show-results="false"
          :monthly-context="true"
        />
        <div
          v-for="(calc, calcIndex) in table.monthlyCalculations"
          :key="calc.id"
          class="calc-stack filter-stack"
          :class="{ collapsed: collapsedCalcs[calc.id] }"
        >
          <div class="filter-stack-header">
            <button
              type="button"
              class="btn-icon btn-stack-collapse"
              :title="collapsedCalcs[calc.id] ? 'Déplier' : 'Replier'"
              @click="collapsedCalcs[calc.id] = !collapsedCalcs[calc.id]"
            >
              {{ collapsedCalcs[calc.id] ? '▶' : '▼' }}
            </button>
            <input
              :value="calc.name"
              type="text"
              class="stack-name calc-name"
              @change="patchCalcName(calc.id, ($event.target as HTMLInputElement).value.trim() || calc.name)"
            >
            <span class="stack-count calc-badge">Calcul</span>
            <button type="button" class="btn-icon btn-calc-remove" @click="store.removeMonthlyCalculation(table.id, calc.id)">×</button>
          </div>
          <div v-show="!collapsedCalcs[calc.id]" class="filter-stack-body calc-body">
            <div class="calc-editor">
              <label>Opération</label>
              <select :value="calc.op" @change="onOpChange(calc, ($event.target as HTMLSelectElement).value as import('@/types').CalcOp)">
                <option v-for="o in CALC_OPS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
              <template v-if="isNaryOp(calc.op)">
                <label>Sources (piles ou calculs précédents)</label>
                <div class="calc-operands-multi">
                  <p v-if="table.monthlyFilterStacks.length" class="calc-operand-group">Piles</p>
                  <label v-for="s in table.monthlyFilterStacks" :key="s.id" class="calc-operand-check">
                    <input
                      type="checkbox"
                      :checked="isOperandSelected(calc, 'stack', s.id)"
                      @change="toggleNaryOperand(calc, 'stack', s.id, ($event.target as HTMLInputElement).checked)"
                    >
                    {{ s.name }}
                  </label>
                  <p v-if="getPreviousCalcs(calcIndex).length" class="calc-operand-group">Calculs</p>
                  <label v-for="c in getPreviousCalcs(calcIndex)" :key="c.id" class="calc-operand-check">
                    <input
                      type="checkbox"
                      :checked="isOperandSelected(calc, 'calc', c.id)"
                      @change="toggleNaryOperand(calc, 'calc', c.id, ($event.target as HTMLInputElement).checked)"
                    >
                    {{ c.name }} ƒ
                  </label>
                </div>
              </template>
              <template v-else>
                <label>Source A</label>
                <select
                  :value="formatOperand(getCalcOperands(calc)[0] ?? { type: 'stack', id: '' })"
                  @change="setBinaryOperand(calc, 0, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <optgroup v-if="table.monthlyFilterStacks.length" label="Piles">
                    <option v-for="s in table.monthlyFilterStacks" :key="s.id" :value="`stack:${s.id}`">{{ s.name }}</option>
                  </optgroup>
                  <optgroup v-if="getPreviousCalcs(calcIndex).length" label="Calculs">
                    <option v-for="c in getPreviousCalcs(calcIndex)" :key="c.id" :value="`calc:${c.id}`">{{ c.name }} ƒ</option>
                  </optgroup>
                </select>
                <label>Source B</label>
                <select
                  :value="formatOperand(getCalcOperands(calc)[1] ?? { type: 'stack', id: '' })"
                  @change="setBinaryOperand(calc, 1, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">—</option>
                  <optgroup v-if="table.monthlyFilterStacks.length" label="Piles">
                    <option v-for="s in table.monthlyFilterStacks" :key="s.id" :value="`stack:${s.id}`">{{ s.name }}</option>
                  </optgroup>
                  <optgroup v-if="getPreviousCalcs(calcIndex).length" label="Calculs">
                    <option v-for="c in getPreviousCalcs(calcIndex)" :key="c.id" :value="`calc:${c.id}`">{{ c.name }} ƒ</option>
                  </optgroup>
                </select>
              </template>
            </div>
            <p class="filter-hint">Utilise les comptages des piles ou les résultats des calculs définis au-dessus.</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
