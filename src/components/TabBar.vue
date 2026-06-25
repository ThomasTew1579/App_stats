<script setup lang="ts">
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { tables, activeTableId } = storeToRefs(store)
</script>

<template>
  <nav class="tab-bar">
    <div
      v-for="table in tables"
      :key="table.id"
      class="tab"
      :class="{ active: table.id === activeTableId }"
      @click="store.setActiveTable(table.id)"
    >
      <input
        type="text"
        class="tab-name"
        :value="table.name"
        title="Renommer le tableau"
        @click.stop
        @change="(e) => store.renameTable(table.id, (e.target as HTMLInputElement).value.trim() || table.name)"
      >
      <button
        v-if="tables.length > 1"
        type="button"
        class="tab-close"
        title="Fermer le tableau"
        @click.stop="store.deleteTable(table.id)"
      >
        ×
      </button>
    </div>
  </nav>
</template>
