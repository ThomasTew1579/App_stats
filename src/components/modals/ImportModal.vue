<script setup lang="ts">
import { computed, watch } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { getHeadersFromRows } from '@/core/xlsxParser'
import { DATE_DISPLAY_FORMATS } from '@/core/formatters'
import type { ColumnFormatter } from '@/types'

const store = useAppStore()
const {
  showImportModal, pendingImport, importMode, targetTableId, idColumnIndex,
  headerRowIndex, columnConfigs, importWarnings, importReport, tables,
} = storeToRefs(store)

const previewRows = computed(() => pendingImport.value?.rows.slice(0, 12) ?? [])
const maxCols = computed(() => Math.max(...previewRows.value.map((r) => r.length), 1))
const headers = computed(() =>
  pendingImport.value ? getHeadersFromRows(pendingImport.value.rows, headerRowIndex.value) : [],
)

const isNewTable = computed(() => importMode.value === 'new')
const targetTable = computed(() => tables.value.find((t) => t.id === targetTableId.value))

watch([importMode, headerRowIndex, targetTableId], () => store.refreshColumnConfigs())

function setFormatter(cfg: typeof columnConfigs.value[0], type: ColumnFormatter['type']) {
  cfg.formatter = { type }
  if (type === 'date') {
    cfg.formatter.inputFormat = 'DD/MM/YYYY HH:mm'
    cfg.formatter.displayFormat = 'DD/MM/YYYY HH:mm'
  }
}

function setAllChecked(checked: boolean) {
  for (const c of columnConfigs.value) c.checked = checked
}

function close() {
  showImportModal.value = false
  pendingImport.value = null
}
</script>

<template>
  <div v-if="showImportModal && pendingImport" class="modal">
    <div class="modal-backdrop" @click="close" />
    <div class="modal-content">
      <header class="modal-header">
        <h2>Importer — <span>{{ pendingImport.fileName }}</span></h2>
        <button type="button" class="modal-close" @click="close">×</button>
      </header>
      <div class="modal-body">
        <div class="form-group">
          <label>Mode d'import</label>
          <select v-model="importMode">
            <option value="new">Nouveau tableau</option>
            <option value="append" :disabled="!tables.length">Ajouter à un tableau existant</option>
            <option value="merge" :disabled="!tables.length">Fusionner (par colonne ID)</option>
          </select>
        </div>
        <div v-show="importMode !== 'new'" class="form-group">
          <label>Tableau cible</label>
          <select v-model="targetTableId">
            <option v-for="t in tables" :key="t.id" :value="t.id">{{ t.name }}</option>
          </select>
        </div>
        <div v-show="importMode === 'merge'" class="form-group">
          <label>Colonne ID (fusion)</label>
          <select v-model.number="idColumnIndex">
            <option v-for="h in headers" :key="h.index" :value="h.index">{{ h.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Ligne de titre des colonnes</label>
          <select v-model.number="headerRowIndex">
            <option v-for="(_, i) in Math.min(pendingImport.rows.length, 15)" :key="i" :value="i">Ligne {{ i + 1 }}</option>
          </select>
        </div>
        <div class="preview-section">
          <h3>Aperçu du fichier</h3>
          <div class="preview-wrapper">
            <table id="preview-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th v-for="ci in maxCols" :key="ci">{{ String.fromCharCode(65 + ((ci - 1) % 26)) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in previewRows" :key="ri" :class="{ 'header-selected': ri === headerRowIndex }">
                  <td>{{ ri + 1 }}</td>
                  <td v-for="ci in maxCols" :key="ci">{{ row[ci - 1] ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="columns-section">
          <div class="columns-section-header">
            <h3>Colonnes à importer</h3>
            <div class="columns-toggle-btns">
              <button type="button" class="btn btn-secondary btn-sm" @click="setAllChecked(true)">Tout sélectionner</button>
              <button type="button" class="btn btn-secondary btn-sm" @click="setAllChecked(false)">Tout désélectionner</button>
            </div>
          </div>
          <div id="columns-config">
            <div
              v-for="cfg in columnConfigs"
              :key="cfg.sourceIndex"
              class="column-config"
              :class="{ disabled: cfg.checked === false }"
            >
              <label class="checkbox-label">
                <input v-model="cfg.checked" type="checkbox">
                <span>{{ cfg.sourceLabel }}</span>
              </label>
              <div v-show="cfg.checked !== false" class="formatter-options">
                <div v-if="!isNewTable" class="formatter-row">
                  <label>Lier à la colonne :</label>
                  <select v-model="cfg.mapToColumnId">
                    <option :value="null">— Nouvelle colonne —</option>
                    <option v-for="c in targetTable?.columns ?? []" :key="c.id" :value="c.id">{{ c.name }}</option>
                  </select>
                </div>
                <div class="formatter-row">
                  <label>Formateur :</label>
                  <select :value="cfg.formatter.type" @change="setFormatter(cfg, ($event.target as HTMLSelectElement).value as ColumnFormatter['type'])">
                    <option value="none">Aucun</option>
                    <option value="date">Date</option>
                    <option value="number">Nombre</option>
                    <option value="uppercase">Majuscules</option>
                  </select>
                </div>
                <div v-show="cfg.formatter.type === 'date'" class="formatter-row date-options">
                  <label>Format source :</label>
                  <input v-model="cfg.formatter.inputFormat" type="text" placeholder="DD/MM/YYYY HH:mm">
                  <label>Affichage :</label>
                  <select v-model="cfg.formatter.displayFormat">
                    <option v-for="f in Object.keys(DATE_DISPLAY_FORMATS)" :key="f" :value="f">{{ f }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="importWarnings.length || importReport" class="warnings">
          <strong v-if="importWarnings.length">Avertissements :</strong>
          <ul v-if="importWarnings.length">
            <li v-for="(w, i) in importWarnings.slice(0, 20)" :key="i">{{ w }}</li>
            <li v-if="importWarnings.length > 20">… et {{ importWarnings.length - 20 }} autres</li>
          </ul>
          <div v-if="importReport" class="import-report">
            Import terminé : {{ importReport.imported }} ligne(s) ajoutée(s)<template v-if="importReport.replaced">, {{ importReport.replaced }} ligne(s) remplacée(s) (ID)</template>.
          </div>
        </div>
      </div>
      <footer class="modal-footer">
        <button type="button" class="btn btn-secondary" @click="close">Annuler</button>
        <button type="button" class="btn btn-primary" @click="store.executeImport()">Importer</button>
      </footer>
    </div>
  </div>
</template>
