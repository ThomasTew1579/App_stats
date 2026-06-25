<script setup lang="ts">
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const store = useAppStore()
const { showDetailModal, detailTitle, detailHtml } = storeToRefs(store)
</script>

<template>
  <div v-if="showDetailModal" class="modal">
    <div class="modal-backdrop" @click="showDetailModal = false" />
    <div class="modal-content modal-content-wide">
      <header class="modal-header">
        <h2>{{ detailTitle }}</h2>
        <button type="button" class="modal-close" @click="showDetailModal = false">×</button>
      </header>
      <div class="modal-body" v-html="detailHtml" />
    </div>
  </div>
</template>
