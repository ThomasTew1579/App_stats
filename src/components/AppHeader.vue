<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { parseXlsxFile } from '@/core/xlsxParser'

const store = useAppStore()
const { activeTable } = storeToRefs(store)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const parsed = await parseXlsxFile(file)
    store.openImport(parsed)
  } catch (err) {
    alert('Erreur lors de la lecture du fichier : ' + (err as Error).message)
  }
  input.value = ''
}
</script>

<template>
  <header class="app-header">
    <h1>App Stats</h1>
    <div class="header-actions">
      <label class="btn btn-primary">
        Importer un fichier .xlsx
        <input ref="fileInput" type="file" accept=".xlsx,.xls" hidden @change="onFileChange">
      </label>
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="!activeTable"
        @click="store.showColumnModal = true"
      >
        Configurer les colonnes
      </button>
      <button
        type="button"
        class="btn btn-secondary"
        :disabled="!activeTable"
        @click="store.exportPdf()"
      >
        Exporter rapport PDF
      </button>
    </div>
  </header>
</template>
