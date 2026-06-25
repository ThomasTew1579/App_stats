<script setup lang="ts">
import type { AppView } from '@/types'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { activeView } = storeToRefs(store)

const views: { id: AppView; label: string }[] = [
  { id: 'table', label: 'Données' },
  { id: 'info', label: 'Information' },
  { id: 'stats', label: 'Filtre courant' },
  { id: 'monthly', label: 'Filtre mensuel' },
  { id: 'values', label: 'Valeurs' },
  { id: 'charts', label: 'Graphiques' },
]
</script>

<template>
  <footer class="view-switcher">
    <button
      v-for="v in views"
      :key="v.id"
      type="button"
      class="view-btn"
      :class="{ active: activeView === v.id }"
      @click="store.setActiveView(v.id)"
    >
      {{ v.label }}
    </button>
  </footer>
</template>
