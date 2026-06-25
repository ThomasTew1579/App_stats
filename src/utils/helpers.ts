export function uid(): string {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined
  return ((...args: Parameters<T>) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }) as T
}

export const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'] as const

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatTimestamp(ts: number, mode: 'date' | 'datetime' | 'iso-date'): string {
  const d = new Date(ts)
  const day = pad2(d.getDate())
  const month = pad2(d.getMonth() + 1)
  const year = d.getFullYear()
  const hours = pad2(d.getHours())
  const mins = pad2(d.getMinutes())
  if (mode === 'date') return `${day}/${month}/${year}`
  if (mode === 'datetime') return `${day}/${month}/${year} ${hours}:${mins}`
  return `${year}-${month}-${day}`
}

export function formatTsLabel(ts: number | undefined): string {
  if (!ts) return '—'
  return formatTimestamp(ts, 'datetime')
}

export const DEFAULT_CHART_COLORS = [
  '#e94560', '#4ecca3', '#ffc107', '#0f3460',
  '#ff6b6b', '#a29bfe', '#fd79a8', '#00cec9',
] as const

export function periodLabel(state: { periodMode: string; year: string; month: string }): string {
  if (state.periodMode === 'year') return `Année ${state.year}`
  if (state.periodMode === 'month') return formatMonthLabel(state.month)
  return 'Totalité des dates'
}
