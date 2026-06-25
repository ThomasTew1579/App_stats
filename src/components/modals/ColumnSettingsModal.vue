<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { DATE_DISPLAY_FORMATS } from '@/core/formatters'
import type { ColumnFormatter } from '@/types'

const store = useAppStore()
const { showColumnModal, activeTable } = storeToRefs(store)

interface ColEdit {
  colId: string
  name: string
  formatter: ColumnFormatter
}

const edits = ref<ColEdit[]>([])

watch(showColumnModal, (open) => {
  if (open && activeTable.value) {
    edits.value = activeTable.value.columns.map((col) => ({
      colId: col.id,
      name: col.name,
      formatter: { ...col.formatter },
    }))
  }
})

function setType(edit: ColEdit, type: ColumnFormatter['type']) {
  edit.formatter = { type }
  if (type === 'date') {
    edit.formatter.inputFormat = edit.formatter.inputFormat ?? 'DD/MM/YYYY HH:mm'
    edit.formatter.displayFormat = edit.formatter.displayFormat ?? 'DD/MM/YYYY HH:mm'
  }
}

function save() {
  store.saveColumnSettings(edits.value.map((e) => ({
    colId: e.colId,
    name: e.name.trim() || e.colId,
    formatter: e.formatter,
  })))
}
</script>

<template>
  <div v-if="showColumnModal && activeTable" class="modal">
    <div class="modal-backdrop" @click="showColumnModal = false" />
    <div class="modal-content">
      <header class="modal-header">
        <h2>Configuration des colonnes</h2>
        <button type="button" class="modal-close" @click="showColumnModal = false">×</button>
      </header>
      <div class="modal-body">
        <div v-for="edit in edits" :key="edit.colId" class="column-setting-item">
          <h4>{{ edit.name }}</h4>
          <div class="form-group">
            <label>Nom de la colonne</label>
            <input v-model="edit.name" type="text">
          </div>
          <div class="formatter-options">
            <div class="formatter-row">
              <label>Formateur :</label>
              <select :value="edit.formatter.type" @change="setType(edit, ($event.target as HTMLSelectElement).value as ColumnFormatter['type'])">
                <option value="none">Aucun</option>
                <option value="date">Date</option>
                <option value="number">Nombre</option>
                <option value="uppercase">Majuscules</option>
              </select>
            </div>
            <div v-show="edit.formatter.type === 'date'" class="formatter-row date-options">
              <label>Format source :</label>
              <input v-model="edit.formatter.inputFormat" type="text">
              <label>Affichage :</label>
              <select v-model="edit.formatter.displayFormat">
                <option v-for="f in Object.keys(DATE_DISPLAY_FORMATS)" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="showColumnModal = false">Annuler</button>
        <button type="button" class="btn btn-primary" @click="save">Enregistrer</button>
      </footer>
    </div>
  </div>
</template>
