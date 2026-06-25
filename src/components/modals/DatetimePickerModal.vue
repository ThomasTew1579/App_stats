<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { pad2 } from '@/utils/helpers'

const store = useAppStore()
const { showDatetimeModal, datetimeInitial } = storeToRefs(store)

const viewYear = ref(0)
const viewMonth = ref(0)
const selectedDay = ref<number | null>(null)
const timeValue = ref('00:00')

const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const monthLabel = computed(() => `${monthNames[viewMonth.value]} ${viewYear.value}`)

const calendarCells = computed(() => {
  const firstDay = new Date(viewYear.value, viewMonth.value, 1).getDay()
  const offset = (firstDay + 6) % 7
  const daysInMonth = new Date(viewYear.value, viewMonth.value + 1, 0).getDate()
  const cells: ({ type: 'empty' } | { type: 'day'; day: number })[] = []
  for (let i = 0; i < offset; i++) cells.push({ type: 'empty' })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ type: 'day', day: d })
  return cells
})

watch(showDatetimeModal, (open) => {
  if (open) {
    const d = new Date(datetimeInitial.value)
    viewYear.value = d.getFullYear()
    viewMonth.value = d.getMonth()
    selectedDay.value = d.getDate()
    timeValue.value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
})

function prevMonth() {
  viewMonth.value--
  if (viewMonth.value < 0) { viewMonth.value = 11; viewYear.value-- }
}

function nextMonth() {
  viewMonth.value++
  if (viewMonth.value > 11) { viewMonth.value = 0; viewYear.value++ }
}

function confirm() {
  const day = selectedDay.value ?? 1
  const [hh, mm] = timeValue.value.split(':').map(Number)
  const ts = new Date(viewYear.value, viewMonth.value, day, hh || 0, mm || 0, 0).getTime()
  store.confirmDatetime(ts)
}

function close() {
  showDatetimeModal.value = false
}
</script>

<template>
  <div v-if="showDatetimeModal" class="modal">
    <div class="modal-backdrop" @click="close" />
    <div class="modal-content modal-content-sm">
      <header class="modal-header">
        <h2>Sélectionner une date</h2>
        <button type="button" class="modal-close" @click="close">×</button>
      </header>
      <div class="modal-body datetime-body">
        <div class="calendar-nav">
          <button type="button" class="btn-icon" @click="prevMonth">‹</button>
          <span>{{ monthLabel }}</span>
          <button type="button" class="btn-icon" @click="nextMonth">›</button>
        </div>
        <div class="calendar-grid">
          <div v-for="d in ['L','M','M','J','V','S','D']" :key="d" class="cal-head">{{ d }}</div>
          <template v-for="(cell, i) in calendarCells" :key="i">
            <div v-if="cell.type === 'empty'" class="cal-empty" />
            <button
              v-else
              type="button"
              class="cal-day"
              :class="{ selected: cell.day === selectedDay }"
              @click="selectedDay = cell.day"
            >
              {{ cell.day }}
            </button>
          </template>
        </div>
        <div class="time-picker">
          <label>Heure</label>
          <input v-model="timeValue" type="time" value="00:00">
        </div>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="close">Annuler</button>
        <button type="button" class="btn btn-primary" @click="confirm">Confirmer</button>
      </footer>
    </div>
  </div>
</template>
