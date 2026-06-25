<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { showFilterImportModal } = storeToRefs(store)
const jsonText = ref('')

function confirm() {
  store.importFilters(jsonText.value)
  jsonText.value = ''
}

function close() {
  showFilterImportModal.value = false
  jsonText.value = ''
}
</script>

<template>
  <div v-if="showFilterImportModal" class="modal">
    <div class="modal-backdrop" @click="close" />
    <div class="modal-content">
      <header class="modal-header">
        <h2>Importer configuration filtres (JSON)</h2>
        <button type="button" class="modal-close" @click="close">×</button>
      </header>
      <div class="modal-body">
        <textarea v-model="jsonText" rows="12" placeholder="Collez ici le JSON exporté…" />
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="close">Annuler</button>
        <button type="button" class="btn btn-primary" @click="confirm">Importer</button>
      </footer>
    </div>
  </div>
</template>
