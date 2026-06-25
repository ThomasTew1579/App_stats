<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'
import { collectTableInfo } from '@/core/infoStats'

const store = useAppStore()
const { activeTable } = storeToRefs(store)

const info = computed(() => activeTable.value ? collectTableInfo(activeTable.value) : null)
</script>

<template>
  <section id="view-info">
    <div class="stats-panel">
      <header class="stats-header">
        <h2>Information — <span>{{ activeTable?.name ?? '—' }}</span></h2>
      </header>
      <p v-if="!info" class="empty-state">Aucune donnée. Importez un fichier .xlsx.</p>
      <div v-else class="info-content">
        <div class="info-grid">
          <div class="info-card">
            <h3>Général</h3>
            <dl>
              <dt>Nom du tableau</dt><dd>{{ info.name }}</dd>
              <dt>Fichier source</dt><dd>{{ info.sourceFile }}</dd>
              <dt>Lignes</dt><dd>{{ info.rowCount }}</dd>
              <dt>Colonnes</dt><dd>{{ info.colCount }}</dd>
              <dt>Cellules vides</dt><dd>{{ info.emptyCells }} / {{ info.totalCells }}</dd>
            </dl>
          </div>
          <div class="info-card">
            <h3>Colonnes</h3>
            <ul class="info-col-list">
              <li v-for="c in info.columnTypes" :key="c.name">
                <strong>{{ c.name }}</strong> <span class="info-type">{{ c.type }}</span>
              </li>
            </ul>
          </div>
          <div v-if="info.dateColumns.length" class="info-card">
            <h3>Dates</h3>
            <dl v-for="d in info.dateColumns" :key="d.name" class="info-sub">
              <dt>{{ d.name }}</dt>
              <dd>Plus ancienne : {{ d.min }}</dd>
              <dd>Plus récente : {{ d.max }}</dd>
              <dd>Valeurs valides : {{ d.valid }}</dd>
            </dl>
          </div>
          <div v-if="info.numberStats.length" class="info-card">
            <h3>Nombres</h3>
            <dl v-for="n in info.numberStats" :key="n.name" class="info-sub">
              <dt>{{ n.name }}</dt>
              <dd>Min : {{ n.min }}</dd>
              <dd>Max : {{ n.max }}</dd>
              <dd>Valeurs valides : {{ n.valid }}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
