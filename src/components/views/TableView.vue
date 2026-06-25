<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { formatCellValue } from '@/core/formatters'
import type { Column, DataRow } from '@/types'

const ROW_HEIGHT = 32
const OVERSCAN = 8

const store = useAppStore()
const { activeTable } = storeToRefs(store)
const scrollRef = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const viewportHeight = ref(600)

const tableInfo = computed(() => {
  const t = activeTable.value
  if (!t) return ''
  return `${t.rows.length} ligne(s) · ${t.columns.length} colonne(s)`
})

const visibleRange = computed(() => {
  const rows = activeTable.value?.rows ?? []
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN)
  const visibleCount = Math.ceil(viewportHeight.value / ROW_HEIGHT) + OVERSCAN * 2
  const end = Math.min(rows.length, start + visibleCount)
  return { start, end, total: rows.length }
})

const visibleRows = computed(() => {
  const table = activeTable.value
  if (!table) return [] as { row: DataRow; index: number }[]
  const { start, end } = visibleRange.value
  return table.rows.slice(start, end).map((row, i) => ({ row, index: start + i }))
})

function cellValue(row: DataRow, col: Column) {
  return formatCellValue(row, col)
}

function onScroll(e: Event) {
  requestAnimationFrame(() => {
    scrollTop.value = (e.target as HTMLElement).scrollTop
  })
}

function updateViewport() {
  if (scrollRef.value) viewportHeight.value = scrollRef.value.clientHeight
}

watch(activeTable, () => {
  scrollTop.value = 0
  if (scrollRef.value) scrollRef.value.scrollTop = 0
})

onMounted(() => {
  updateViewport()
})
</script>

<template>
  <section id="view-table">
    <div class="table-toolbar">
      <span class="table-info">{{ tableInfo }}</span>
    </div>
    <div v-if="!activeTable" class="table-wrapper">
      <p class="empty-state">Aucun tableau. Importez un fichier .xlsx pour commencer.</p>
    </div>
    <div v-else class="table-wrapper virtual-table-wrapper">
      <div
        ref="scrollRef"
        class="virtual-scroll"
        @scroll="onScroll"
      >
        <table class="data-table-virtual">
          <thead>
            <tr>
              <th v-for="col in activeTable.columns" :key="col.id">{{ col.name }}</th>
            </tr>
          </thead>
          <tbody :style="{ height: `${visibleRange.total * ROW_HEIGHT}px`, position: 'relative' }">
            <tr
              v-for="{ row, index } in visibleRows"
              :key="row.id"
              :style="{ transform: `translateY(${index * ROW_HEIGHT}px)`, position: 'absolute', width: '100%', display: 'table', tableLayout: 'fixed' }"
            >
              <td v-for="col in activeTable.columns" :key="col.id">{{ cellValue(row, col) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.virtual-table-wrapper {
  flex: 1;
  min-height: 0;
}

.virtual-scroll {
  height: calc(100vh - 220px);
  overflow: auto;
}

.data-table-virtual {
  width: 100%;
  border-collapse: collapse;
}

.data-table-virtual thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-tertiary);
}

.data-table-virtual td,
.data-table-virtual th {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 32px;
}
</style>
