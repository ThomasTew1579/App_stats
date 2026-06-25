<script setup lang="ts">
import { computed, triggerRef } from 'vue'
import type { DataTable, MonthlyCalculation } from '@/types'
import { CALC_OPS, ensureMonthlyConfig, getCalcOperands, isNaryOp } from '@/core/monthlyEngine'
import { useAppStore } from '@/stores/appStore'
import FilterStackPanel from '@/components/FilterStackPanel.vue'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { activeTable } = storeToRefs(store)

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
  if (checked) {
    calc.operands = [...ops, { type, id }]
  } else {
    calc.operands = ops.filter((o) => !(o.type === type && o.id === id))
  }
  delete calc.stackIds
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function setBinaryOperand(calc: MonthlyCalculation, index: number, val: string) {
  const ops = [...getCalcOperands(calc)]
  const parsed = parseOperand(val)
  if (parsed) ops[index] = parsed
  else ops.splice(index, 1)
  calc.operands = ops.filter(Boolean)
  delete calc.stackIds
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
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

function removeCalc(calcId: string) {
  if (!table.value) return
  table.value.monthlyCalculations = table.value.monthlyCalculations.filter((c) => c.id !== calcId)
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function onOpChange(calc: MonthlyCalculation) {
  calc.operands = []
  delete calc.stackIds
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
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
        <select id="month-date-column" v-model="table.monthDateColumnId">
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
          :table="table"
          stacks-key="monthlyFilterStacks"
          :show-results="false"
          :monthly-context="true"
        />
        <div
          v-for="(calc, calcIndex) in table.monthlyCalculations"
          :key="calc.id"
          class="calc-stack filter-stack"
        >
          <div class="filter-stack-header">
            <input v-model="calc.name" type="text" class="stack-name calc-name">
            <span class="stack-count calc-badge">Calcul</span>
            <button type="button" class="btn-icon btn-calc-remove" @click="removeCalc(calc.id)">×</button>
          </div>
          <div class="filter-stack-body calc-body">
            <div class="calc-editor">
              <label>Opération</label>
              <select v-model="calc.op" @change="onOpChange(calc)">
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
