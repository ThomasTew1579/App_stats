<script setup lang="ts">
import { computed, triggerRef } from 'vue'
import type { DataTable, Filter, FilterStack } from '@/types'
import {
  FILTER_TYPES, TEXT_MODES, DATE_MODES, MONTHLY_DATE_MODES, NUMBER_MODES,
  FILTER_CONNECTORS, applyStack, defaultFilter, getDistinctValues,
  getDateColumns, getNumberColumns,
} from '@/core/filterEngine'
import { formatTsLabel } from '@/utils/helpers'
import { useAppStore } from '@/stores/appStore'
import { formatCellValue } from '@/core/formatters'
import { escapeHtml } from '@/utils/helpers'

const props = defineProps<{
  stack: FilterStack
  table: DataTable
  stacksKey: 'filterStacks' | 'monthlyFilterStacks'
  showResults?: boolean
  monthlyContext?: boolean
}>()

const store = useAppStore()

const filtered = computed(() =>
  props.monthlyContext ? [] : applyStack(props.table.rows, props.stack, props.table),
)

function removeStack() {
  const arr = props.table[props.stacksKey]
  props.table[props.stacksKey] = arr.filter((s) => s.id !== props.stack.id)
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function addFilter(type: string) {
  props.stack.filters.push(defaultFilter(type as import('@/types').FilterType, props.table, props.monthlyContext))
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function removeFilter(filterId: string) {
  props.stack.filters = props.stack.filters.filter((f) => f.id !== filterId)
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function moveFilter(filterId: string, dir: -1 | 1) {
  const i = props.stack.filters.findIndex((f) => f.id === filterId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= props.stack.filters.length) return
  const arr = [...props.stack.filters]
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  props.stack.filters = arr
  triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
}

function pickDate(filter: Filter, field: 'date1' | 'date2') {
  store.openDatetimePicker(filter[field] ?? Date.now(), (ts) => {
    filter[field] = ts
    triggerRef(store.tables as unknown as import('vue').ShallowRef<DataTable[]>)
  })
}

function resultTableHtml(maxRows = 200) {
  const rows = filtered.value
  if (!rows.length) return '<p class="filter-no-rows">Aucune ligne ne correspond à cette pile.</p>'
  const slice = rows.slice(0, maxRows)
  let html = '<div class="filter-result-wrapper"><table class="filter-result-table"><thead><tr>'
  for (const col of props.table.columns) html += `<th>${escapeHtml(col.name)}</th>`
  html += '</tr></thead><tbody>'
  for (const row of slice) {
    html += '<tr>'
    for (const col of props.table.columns) {
      html += `<td>${escapeHtml(String(formatCellValue(row, col) ?? ''))}</td>`
    }
    html += '</tr>'
  }
  html += '</tbody></table></div>'
  if (rows.length > maxRows) {
    html += `<p class="filter-truncated">… ${rows.length - maxRows} ligne(s) supplémentaire(s) non affichée(s)</p>`
  }
  return html
}
</script>

<template>
  <div class="filter-stack" :data-stack-id="stack.id">
    <div class="filter-stack-header">
      <input v-model="stack.name" type="text" class="stack-name" title="Nom de la pile">
      <span class="stack-count">
        {{ monthlyContext ? 'Comptage → onglet Valeurs' : `${filtered.length} / ${table.rows.length} ligne(s)` }}
      </span>
      <button type="button" class="btn-icon btn-stack-remove" title="Supprimer la pile" @click="removeStack">×</button>
    </div>
    <div class="filter-stack-body">
      <div class="filter-add-row">
        <select class="filter-type-select" @change="(e) => { addFilter((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).selectedIndex = 0 }">
          <option value="" disabled selected>Ajouter filtre…</option>
          <option v-for="t in FILTER_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <button type="button" class="btn btn-secondary btn-add-filter" @click="addFilter('text')">+ Filtre</button>
      </div>

      <div class="filter-list">
        <template v-if="!stack.filters.length">
          <p class="filter-hint">Ajoutez des filtres pour créer un compteur.</p>
        </template>
        <template v-for="(filter, idx) in stack.filters" :key="filter.id">
          <div v-if="idx > 0" class="filter-connector">
            <select v-model="filter.connector" class="filter-connector-select" title="Condition avec le filtre précédent">
              <option v-for="c in FILTER_CONNECTORS" :key="c.value" :value="c.value" :title="c.title">{{ c.label }}</option>
            </select>
          </div>
          <div class="filter-item" :data-filter-id="filter.id">
            <div class="filter-item-header">
              <span class="filter-order">#{{ idx + 1 }}</span>
              <span class="filter-type-badge">{{ FILTER_TYPES.find(t => t.value === filter.type)?.label }}</span>
              <span v-if="idx > 0" class="filter-connector-badge">{{ filter.connector || 'ET' }}</span>
              <div class="filter-item-actions">
                <button type="button" class="btn-icon" :disabled="idx === 0" @click="moveFilter(filter.id, -1)">↑</button>
                <button type="button" class="btn-icon" :disabled="idx === stack.filters.length - 1" @click="moveFilter(filter.id, 1)">↓</button>
                <button type="button" class="btn-icon btn-filter-remove" @click="removeFilter(filter.id)">×</button>
              </div>
            </div>
            <div class="filter-editor">
              <template v-if="filter.type === 'text'">
                <label>Colonne</label>
                <select v-model="filter.columnId">
                  <option v-for="c in table.columns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Mode</label>
                <select v-model="filter.matchMode">
                  <option v-for="m in TEXT_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
                <label>Mots / chaînes (un par ligne)</label>
                <textarea :value="(filter.terms ?? []).join('\n')" rows="2" @input="filter.terms = ($event.target as HTMLTextAreaElement).value.split('\n')" />
              </template>

              <template v-else-if="filter.type === 'value'">
                <label>Colonne</label>
                <select v-model="filter.columnId">
                  <option v-for="c in table.columns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Valeurs</label>
                <select multiple size="5" :value="filter.values" @change="filter.values = [...($event.target as HTMLSelectElement).selectedOptions].map(o => o.value)">
                  <option v-for="v in getDistinctValues(table, filter.columnId)" :key="v" :value="v" :selected="(filter.values ?? []).includes(v)">{{ v }}</option>
                </select>
              </template>

              <template v-else-if="filter.type === 'date'">
                <label>Colonne (date)</label>
                <select v-model="filter.columnId">
                  <option v-for="c in getDateColumns(table)" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <template v-if="monthlyContext">
                  <label>Période (relative au mois de la colonne)</label>
                  <select v-model="filter.dateMode">
                    <option v-for="m in MONTHLY_DATE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <div v-if="filter.dateMode === 'debut_mois' || filter.dateMode === 'fin_mois'" class="filter-monthly-compare-row">
                    <label>Par rapport au point de référence</label>
                    <select v-model="filter.monthlyDateCompare">
                      <option value="avant">Avant</option>
                      <option value="apres">Après</option>
                    </select>
                  </div>
                  <p class="filter-hint monthly-date-hint">Le mois de référence est celui de chaque colonne du tableau des valeurs.</p>
                </template>
                <template v-else>
                  <label>Condition</label>
                  <select v-model="filter.dateMode">
                    <option v-for="m in DATE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <div class="date-picks">
                    <button type="button" class="btn btn-secondary btn-pick-date" @click="pickDate(filter, 'date1')">
                      {{ filter.dateMode === 'between' ? 'Début' : 'Date' }} : {{ formatTsLabel(filter.date1) }}
                    </button>
                    <button v-if="filter.dateMode === 'between'" type="button" class="btn btn-secondary btn-pick-date" @click="pickDate(filter, 'date2')">
                      Fin : {{ formatTsLabel(filter.date2) }}
                    </button>
                  </div>
                </template>
              </template>

              <template v-else-if="filter.type === 'number'">
                <label>Colonne</label>
                <select v-model="filter.columnId">
                  <option v-for="c in getNumberColumns(table)" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Condition</label>
                <select v-model="filter.numberMode">
                  <option v-for="m in NUMBER_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
                <label>{{ filter.numberMode === 'between' ? 'Min' : 'Valeur' }}</label>
                <input v-model.number="filter.num1" type="number" step="any">
                <template v-if="filter.numberMode === 'between'">
                  <label>Max</label>
                  <input v-model.number="filter.num2" type="number" step="any">
                </template>
              </template>

              <template v-else>
                <label>Colonne</label>
                <select v-model="filter.columnId">
                  <option v-for="c in table.columns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </template>
            </div>
          </div>
        </template>
      </div>

      <div v-if="showResults !== false" class="filter-results">
        <h4>Résultat après filtrage</h4>
        <div v-html="resultTableHtml()" />
      </div>
      <p v-else class="filter-hint">Les comptages mensuels apparaissent dans l'onglet « Valeur des statistiques ».</p>
    </div>
  </div>
</template>
