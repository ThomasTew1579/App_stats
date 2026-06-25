<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Filter, FilterStack } from '@/types'
import {
  FILTER_TYPES, TEXT_MODES, DATE_MODES, MONTHLY_DATE_MODES, NUMBER_MODES,
  FILTER_CONNECTORS, applyStack, getDistinctValues,
  getDateColumns, getNumberColumns,
} from '@/core/filterEngine'
import { debounce, formatTsLabel } from '@/utils/helpers'
import { useAppStore } from '@/stores/appStore'
import { formatCellValue } from '@/core/formatters'

const MAX_RESULT_ROWS = 200

const props = defineProps<{
  stack: FilterStack
  tableId: string
  stacksKey: 'filterStacks' | 'monthlyFilterStacks'
  showResults?: boolean
  monthlyContext?: boolean
}>()

const store = useAppStore()
const collapsed = ref(false)

const table = computed(() => store.tables.find((t) => t.id === props.tableId) ?? null)
const stack = computed(() =>
  table.value?.[props.stacksKey].find((s) => s.id === props.stack.id) ?? props.stack,
)

const filtered = computed(() => {
  const t = table.value
  if (!t || props.monthlyContext) return []
  return applyStack(t.rows, stack.value, t)
})

const displayedRows = computed(() => filtered.value.slice(0, MAX_RESULT_ROWS))
const truncatedCount = computed(() => Math.max(0, filtered.value.length - MAX_RESULT_ROWS))

function patchFilter(filterId: string, patch: Partial<Filter>) {
  store.updateTable(props.tableId, (t) => ({
    ...t,
    [props.stacksKey]: t[props.stacksKey].map((s) =>
      s.id !== props.stack.id
        ? s
        : { ...s, filters: s.filters.map((f) => (f.id !== filterId ? f : { ...f, ...patch })) },
    ),
  }))
}

const debouncedPatchFilter = debounce(patchFilter, 350)

function patchStackName(name: string) {
  store.updateTable(props.tableId, (t) => ({
    ...t,
    [props.stacksKey]: t[props.stacksKey].map((s) =>
      s.id !== props.stack.id ? s : { ...s, name },
    ),
  }))
}
</script>

<template>
  <div class="filter-stack" :class="{ collapsed }" :data-stack-id="stack.id">
    <div class="filter-stack-header">
      <button
        type="button"
        class="btn-icon btn-stack-collapse"
        :title="collapsed ? 'Déplier' : 'Replier'"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        {{ collapsed ? '▶' : '▼' }}
      </button>
      <input
        :value="stack.name"
        type="text"
        class="stack-name"
        title="Nom de la pile"
        @change="patchStackName(($event.target as HTMLInputElement).value.trim() || stack.name)"
      >
      <span class="stack-count">
        {{ monthlyContext ? 'Comptage → onglet Valeurs' : `${filtered.length} / ${table?.rows.length ?? 0} ligne(s)` }}
      </span>
      <button
        type="button"
        class="btn-icon btn-stack-remove"
        title="Supprimer la pile"
        @click="store.removeFilterStack(tableId, stacksKey, stack.id)"
      >
        ×
      </button>
    </div>
    <div v-show="!collapsed" class="filter-stack-body">
      <div class="filter-add-row">
        <select
          class="filter-type-select"
          @change="(e) => {
            const sel = e.target as HTMLSelectElement
            if (sel.value) {
              store.addFilterToStack(tableId, stacksKey, stack.id, sel.value as import('@/types').FilterType, !!monthlyContext)
              sel.selectedIndex = 0
            }
          }"
        >
          <option value="" disabled selected>Ajouter filtre…</option>
          <option v-for="t in FILTER_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <button
          type="button"
          class="btn btn-secondary btn-add-filter"
          @click="store.addFilterToStack(tableId, stacksKey, stack.id, 'text', !!monthlyContext)"
        >
          + Filtre
        </button>
      </div>

      <div class="filter-list">
        <template v-if="!stack.filters.length">
          <p class="filter-hint">Ajoutez des filtres pour créer un compteur.</p>
        </template>
        <template v-for="(filter, idx) in stack.filters" :key="filter.id">
          <div v-if="idx > 0" class="filter-connector">
            <select
              :value="filter.connector"
              class="filter-connector-select"
              title="Condition avec le filtre précédent"
              @change="patchFilter(filter.id, { connector: ($event.target as HTMLSelectElement).value as Filter['connector'] })"
            >
              <option v-for="c in FILTER_CONNECTORS" :key="c.value" :value="c.value" :title="c.title">{{ c.label }}</option>
            </select>
          </div>
          <div class="filter-item" :data-filter-id="filter.id">
            <div class="filter-item-header">
              <span class="filter-order">#{{ idx + 1 }}</span>
              <span class="filter-type-badge">{{ FILTER_TYPES.find(t => t.value === filter.type)?.label }}</span>
              <span v-if="idx > 0" class="filter-connector-badge">{{ filter.connector || 'ET' }}</span>
              <div class="filter-item-actions">
                <button type="button" class="btn-icon" :disabled="idx === 0" @click="store.moveFilterInStack(tableId, stacksKey, stack.id, filter.id, -1)">↑</button>
                <button type="button" class="btn-icon" :disabled="idx === stack.filters.length - 1" @click="store.moveFilterInStack(tableId, stacksKey, stack.id, filter.id, 1)">↓</button>
                <button type="button" class="btn-icon btn-filter-remove" @click="store.removeFilterFromStack(tableId, stacksKey, stack.id, filter.id)">×</button>
              </div>
            </div>
            <div class="filter-editor">
              <template v-if="filter.type === 'text'">
                <label>Colonne</label>
                <select :value="filter.columnId" @change="patchFilter(filter.id, { columnId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in table?.columns ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Mode</label>
                <select :value="filter.matchMode" @change="patchFilter(filter.id, { matchMode: ($event.target as HTMLSelectElement).value as Filter['matchMode'] })">
                  <option v-for="m in TEXT_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
                <label>Mots / chaînes (un par ligne)</label>
                <textarea
                  :value="(filter.terms ?? []).join('\n')"
                  rows="2"
                  @input="debouncedPatchFilter(filter.id, { terms: ($event.target as HTMLTextAreaElement).value.split('\n') })"
                />
              </template>

              <template v-else-if="filter.type === 'value'">
                <label>Colonne</label>
                <select :value="filter.columnId" @change="patchFilter(filter.id, { columnId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in table?.columns ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Valeurs</label>
                <select
                  multiple
                  size="5"
                  @change="patchFilter(filter.id, { values: [...($event.target as HTMLSelectElement).selectedOptions].map(o => o.value) })"
                >
                  <option
                    v-for="v in table ? getDistinctValues(table, filter.columnId) : []"
                    :key="v"
                    :value="v"
                    :selected="(filter.values ?? []).includes(v)"
                  >
                    {{ v }}
                  </option>
                </select>
              </template>

              <template v-else-if="filter.type === 'date'">
                <label>Colonne (date)</label>
                <select :value="filter.columnId" @change="patchFilter(filter.id, { columnId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in table ? getDateColumns(table) : []" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <template v-if="monthlyContext">
                  <label>Période (relative au mois de la colonne)</label>
                  <select :value="filter.dateMode" @change="patchFilter(filter.id, { dateMode: ($event.target as HTMLSelectElement).value as Filter['dateMode'] })">
                    <option v-for="m in MONTHLY_DATE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <div v-if="filter.dateMode === 'debut_mois' || filter.dateMode === 'fin_mois'" class="filter-monthly-compare-row">
                    <label>Par rapport au point de référence</label>
                    <select :value="filter.monthlyDateCompare ?? 'apres'" @change="patchFilter(filter.id, { monthlyDateCompare: ($event.target as HTMLSelectElement).value as 'avant' | 'apres' })">
                      <option value="avant">Avant</option>
                      <option value="apres">Après</option>
                    </select>
                  </div>
                  <p class="filter-hint monthly-date-hint">Le mois de référence est celui de chaque colonne du tableau des valeurs.</p>
                </template>
                <template v-else>
                  <label>Condition</label>
                  <select :value="filter.dateMode" @change="patchFilter(filter.id, { dateMode: ($event.target as HTMLSelectElement).value as Filter['dateMode'] })">
                    <option v-for="m in DATE_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                  <div class="date-picks">
                    <button type="button" class="btn btn-secondary btn-pick-date" @click="store.openDatetimePicker(filter.date1 ?? Date.now(), (ts) => store.updateFilterDate(tableId, stacksKey, stack.id, filter.id, 'date1', ts))">
                      {{ filter.dateMode === 'between' ? 'Début' : 'Date' }} : {{ formatTsLabel(filter.date1) }}
                    </button>
                    <button v-if="filter.dateMode === 'between'" type="button" class="btn btn-secondary btn-pick-date" @click="store.openDatetimePicker(filter.date2 ?? Date.now(), (ts) => store.updateFilterDate(tableId, stacksKey, stack.id, filter.id, 'date2', ts))">
                      Fin : {{ formatTsLabel(filter.date2) }}
                    </button>
                  </div>
                </template>
              </template>

              <template v-else-if="filter.type === 'number'">
                <label>Colonne</label>
                <select :value="filter.columnId" @change="patchFilter(filter.id, { columnId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in table ? getNumberColumns(table) : []" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label>Condition</label>
                <select :value="filter.numberMode" @change="patchFilter(filter.id, { numberMode: ($event.target as HTMLSelectElement).value as Filter['numberMode'] })">
                  <option v-for="m in NUMBER_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
                <label>{{ filter.numberMode === 'between' ? 'Min' : 'Valeur' }}</label>
                <input :value="filter.num1" type="number" step="any" @input="debouncedPatchFilter(filter.id, { num1: parseFloat(($event.target as HTMLInputElement).value) || 0 })">
                <template v-if="filter.numberMode === 'between'">
                  <label>Max</label>
                  <input :value="filter.num2" type="number" step="any" @input="debouncedPatchFilter(filter.id, { num2: parseFloat(($event.target as HTMLInputElement).value) || 0 })">
                </template>
              </template>

              <template v-else>
                <label>Colonne</label>
                <select :value="filter.columnId" @change="patchFilter(filter.id, { columnId: ($event.target as HTMLSelectElement).value })">
                  <option v-for="c in table?.columns ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </template>
            </div>
          </div>
        </template>
      </div>

      <div v-if="showResults !== false" class="filter-results">
        <h4>Résultat après filtrage</h4>
        <p v-if="!displayedRows.length" class="filter-no-rows">Aucune ligne ne correspond à cette pile.</p>
        <div v-else class="filter-result-wrapper">
          <table class="filter-result-table">
            <thead>
              <tr>
                <th v-for="col in table?.columns ?? []" :key="col.id">{{ col.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayedRows" :key="row.id">
                <td v-for="col in table!.columns" :key="col.id">{{ formatCellValue(row, col) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="truncatedCount > 0" class="filter-truncated">… {{ truncatedCount }} ligne(s) supplémentaire(s) non affichée(s)</p>
      </div>
      <p v-else class="filter-hint">Les comptages mensuels apparaissent dans l'onglet « Valeur des statistiques ».</p>
    </div>
  </div>
</template>
