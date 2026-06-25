<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { getAvailableMonths, getChartSeriesList, formatMonthLabel } from '@/core/monthlyEngine'
import { debounce } from '@/utils/helpers'

const store = useAppStore()
const { activeTable, chartPeriod, chartType, chartColumnLayout, chartStackConfig, chartCanvasRef } = storeToRefs(store)

const chartMessage = ref('')
const chartDrawn = ref(false)
const isDrawing = ref(false)

const years = computed(() => {
  const months = activeTable.value ? getAvailableMonths(activeTable.value) : []
  return [...new Set(months.map((k) => k.split('-')[0]))].sort()
})

const allMonths = computed(() => activeTable.value ? getAvailableMonths(activeTable.value) : [])

const seriesList = computed(() =>
  activeTable.value ? getChartSeriesList(activeTable.value) : [],
)

watch(activeTable, () => {
  chartDrawn.value = false
  store.applyChartDefaults()
  store.ensureChartStackConfig()
  chartMessage.value = ''
}, { immediate: true })

async function draw() {
  if (!activeTable.value || isDrawing.value) return
  isDrawing.value = true
  chartMessage.value = ''

  const selectedIds = seriesList.value.filter(
    (s) => chartStackConfig.value[s.id]?.selected !== false,
  )

  if (chartType.value === 'pie' && selectedIds.length < 2) {
    chartMessage.value = 'Le camembert requiert au minimum 2 piles sélectionnées.'
    isDrawing.value = false
    return
  }

  await nextTick()
  requestAnimationFrame(() => {
    store.drawActiveChart(false)
    chartDrawn.value = true
    isDrawing.value = false
  })
}

const onResize = debounce(() => {
  if (chartDrawn.value) draw()
}, 250)

onMounted(() => {
  window.addEventListener('resize', onResize)
  store.ensureChartStackConfig()
})

onUnmounted(() => window.removeEventListener('resize', onResize))

function toggleStack(id: string, selected: boolean) {
  chartStackConfig.value = {
    ...chartStackConfig.value,
    [id]: { ...chartStackConfig.value[id], selected },
  }
}

function setColor(id: string, color: string) {
  chartStackConfig.value = {
    ...chartStackConfig.value,
    [id]: { ...chartStackConfig.value[id], color },
  }
}
</script>

<template>
  <section id="view-charts">
    <div class="stats-panel">
      <header class="stats-header">
        <h2>Graphiques — <span>{{ activeTable?.name ?? '—' }}</span></h2>
      </header>
      <p v-if="!activeTable?.rows.length" class="empty-state">Aucune donnée disponible.</p>
      <template v-else>
        <div class="charts-controls">
          <div class="values-toolbar">
            <div class="form-group">
              <label>Plage</label>
              <select v-model="chartPeriod.periodMode">
                <option value="all">Totalité des dates</option>
                <option value="year">Par année</option>
                <option value="month">Par mois</option>
              </select>
            </div>
            <div v-show="chartPeriod.periodMode === 'year'" class="form-group">
              <label>Année</label>
              <select v-model="chartPeriod.year">
                <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
              </select>
            </div>
            <div v-show="chartPeriod.periodMode === 'month'" class="form-group">
              <label>Mois</label>
              <select v-model="chartPeriod.month">
                <option v-for="m in allMonths" :key="m" :value="m">{{ formatMonthLabel(m) }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>Type de graphique</label>
              <select v-model="chartType">
                <option value="column">Colonnes</option>
                <option value="line">Lignes</option>
                <option value="pie">Camembert</option>
              </select>
            </div>
            <div v-show="chartType === 'column'" class="form-group">
              <label>Disposition colonnes</label>
              <select v-model="chartColumnLayout">
                <option value="grouped">Parallèles</option>
                <option value="stacked">Empilées</option>
              </select>
            </div>
          </div>
          <div class="charts-stack-section">
            <h3>Piles à afficher et couleurs</h3>
            <div class="charts-stack-list">
              <label v-for="series in seriesList" :key="series.id" class="chart-stack-item">
                <input
                  type="checkbox"
                  :checked="chartStackConfig[series.id]?.selected !== false"
                  @change="toggleStack(series.id, ($event.target as HTMLInputElement).checked)"
                >
                <input
                  type="color"
                  :value="chartStackConfig[series.id]?.color ?? '#e94560'"
                  @input="setColor(series.id, ($event.target as HTMLInputElement).value)"
                >
                <span>{{ series.name }}{{ series.isCalculation ? ' ƒ' : '' }}</span>
              </label>
            </div>
          </div>
          <button type="button" class="btn btn-primary" :disabled="isDrawing" @click="draw">
            {{ isDrawing ? 'Calcul en cours…' : 'Actualiser le graphique' }}
          </button>
          <p v-if="chartMessage" class="warnings">{{ chartMessage }}</p>
          <p v-else-if="!chartDrawn" class="filter-hint charts-hint">
            Réglez les paramètres puis cliquez sur « Actualiser le graphique ».
          </p>
        </div>
        <div class="charts-canvas-wrap">
          <canvas :ref="(el) => { chartCanvasRef = el as HTMLCanvasElement | null }" />
        </div>
      </template>
    </div>
  </section>
</template>
