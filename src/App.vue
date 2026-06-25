<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import AppHeader from '@/components/AppHeader.vue'
import TabBar from '@/components/TabBar.vue'
import ViewSwitcher from '@/components/ViewSwitcher.vue'
import ImportModal from '@/components/modals/ImportModal.vue'
import ColumnSettingsModal from '@/components/modals/ColumnSettingsModal.vue'
import FilterImportModal from '@/components/modals/FilterImportModal.vue'
import DetailModal from '@/components/modals/DetailModal.vue'
import DatetimePickerModal from '@/components/modals/DatetimePickerModal.vue'
import TableView from '@/components/views/TableView.vue'
import InfoView from '@/components/views/InfoView.vue'
import { useAppStore } from '@/stores/appStore'
import { storeToRefs } from 'pinia'

const StatsView = defineAsyncComponent(() => import('@/components/views/StatsView.vue'))
const MonthlyView = defineAsyncComponent(() => import('@/components/views/MonthlyView.vue'))
const ValuesView = defineAsyncComponent(() => import('@/components/views/ValuesView.vue'))
const ChartsView = defineAsyncComponent(() => import('@/components/views/ChartsView.vue'))

const store = useAppStore()
const { activeView } = storeToRefs(store)
</script>

<template>
  <AppHeader />
  <TabBar />
  <main class="main-content">
    <TableView v-show="activeView === 'table'" :class="{ active: activeView === 'table' }" class="view" />
    <InfoView v-show="activeView === 'info'" :class="{ active: activeView === 'info' }" class="view" />
    <StatsView v-if="activeView === 'stats'" class="view active" />
    <MonthlyView v-if="activeView === 'monthly'" class="view active" />
    <ValuesView v-if="activeView === 'values'" class="view active" />
    <ChartsView v-if="activeView === 'charts'" class="view active" />
  </main>
  <ViewSwitcher />
  <ImportModal />
  <ColumnSettingsModal />
  <FilterImportModal />
  <DetailModal />
  <DatetimePickerModal />
</template>
