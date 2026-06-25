<script setup lang="ts">
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import FilterStackPanel from '@/components/FilterStackPanel.vue'

const store = useAppStore()
const { activeTable } = storeToRefs(store)
</script>

<template>
  <section id="view-stats">
    <div class="stats-panel">
      <header class="stats-header">
        <h2>Filtre courant — <span>{{ activeTable?.name ?? '—' }}</span></h2>
        <div class="stats-actions">
          <button type="button" class="btn btn-primary" @click="store.addFilterStack(false)">+ Nouvelle pile</button>
          <button type="button" class="btn btn-secondary" @click="store.copyFiltersJson()">Exporter JSON</button>
          <button type="button" class="btn btn-secondary" @click="store.showFilterImportModal = true">Importer JSON</button>
        </div>
      </header>
      <p v-if="!activeTable?.rows.length" class="empty-state">Aucune donnée à filtrer. Importez un tableau d'abord.</p>
      <div v-else class="stats-stacks">
        <FilterStackPanel
          v-for="stack in activeTable.filterStacks"
          :key="stack.id"
          :stack="stack"
          :table="activeTable"
          stacks-key="filterStacks"
          :show-results="true"
        />
      </div>
    </div>
  </section>
</template>
