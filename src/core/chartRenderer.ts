import type { MatrixData, MatrixSeries } from '@/types'
import { DEFAULT_CHART_COLORS } from '@/utils/helpers'

export interface ChartConfig {
  chartType: 'column' | 'line' | 'pie'
  columnLayout: 'grouped' | 'stacked'
  stackConfig: Record<string, { selected: boolean; color: string }>
}

export interface DrawChartOptions {
  exportImage?: boolean
}

const FONT = 'Segoe UI, system-ui, sans-serif'

function cappedDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2)
}

function truncateLabel(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(value)))
  const norm = value / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

function drawYAxisGrid(
  ctx: CanvasRenderingContext2D,
  pad: { l: number; r: number; t: number; b: number },
  chartW: number,
  chartH: number,
  maxVal: number,
) {
  const ticks = 5
  ctx.strokeStyle = '#2a2a4a'
  ctx.lineWidth = 1
  ctx.fillStyle = '#a0a0b0'
  ctx.font = `10px ${FONT}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'

  for (let i = 0; i <= ticks; i++) {
    const ratio = i / ticks
    const y = pad.t + chartH - ratio * chartH
    const val = Math.round(maxVal * ratio)
    ctx.beginPath()
    ctx.moveTo(pad.l, y)
    ctx.lineTo(pad.l + chartW, y)
    ctx.stroke()
    ctx.fillText(String(val), pad.l - 6, y)
  }
}

export function drawChart(
  canvas: HTMLCanvasElement,
  matrix: MatrixData,
  selected: MatrixSeries[],
  config: ChartConfig,
  options: DrawChartOptions = {},
): string | null {
  const dpr = cappedDpr()
  const wrap = canvas.parentElement
  const w = Math.max((wrap?.clientWidth ?? 400) - 2, 400)
  const h = Math.min(480, Math.max(340, 280 + selected.length * 12))
  const nextW = Math.round(w * dpr)
  const nextH = Math.round(h * dpr)

  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW
    canvas.height = nextH
  }
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#16213e'
  ctx.fillRect(0, 0, w, h)

  const type = config.chartType

  if (type === 'pie' && selected.length >= 2) {
    drawPie(ctx, w, h, selected, config)
  } else if (type === 'pie') {
    drawCenterMessage(ctx, w, h, 'Sélectionnez au moins 2 piles')
  } else if (!matrix.monthLabels.length || !selected.length) {
    drawCenterMessage(ctx, w, h, 'Sélectionnez des piles et une plage de dates')
  } else {
    drawBarsOrLines(ctx, w, h, matrix, selected, config)
  }

  if (type !== 'pie' && selected.length) {
    drawLegend(ctx, w, selected, config)
  }

  return options.exportImage && canvas.width ? canvas.toDataURL('image/png') : null
}

function drawCenterMessage(ctx: CanvasRenderingContext2D, w: number, h: number, msg: string) {
  ctx.fillStyle = '#a0a0b0'
  ctx.font = `14px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(msg, w / 2, h / 2)
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  w: number,
  selected: MatrixSeries[],
  config: ChartConfig,
) {
  let ly = 16
  const lx = w - 148
  selected.forEach((s, i) => {
    const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]
    ctx.fillStyle = color
    ctx.fillRect(lx, ly, 12, 12)
    ctx.fillStyle = '#e8e8e8'
    ctx.font = `11px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText(truncateLabel(s.name, 18), lx + 16, ly)
    ly += 18
  })
}

function drawPie(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: MatrixSeries[],
  config: ChartConfig,
) {
  const legendW = Math.min(180, w * 0.35)
  const cx = (w - legendW) / 2
  const cy = h / 2
  const r = Math.min(cx, cy) - 36
  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0))
  const sum = totals.reduce((a, b) => a + b, 0)

  if (sum === 0) {
    drawCenterMessage(ctx, w, h, 'Aucune donnée à afficher')
    return
  }

  let angle = -Math.PI / 2
  series.forEach((s, i) => {
    const val = totals[i]
    if (val <= 0) return
    const slice = (val / sum) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, angle, angle + slice)
    ctx.closePath()
    ctx.fillStyle = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]
    ctx.fill()
    ctx.strokeStyle = '#16213e'
    ctx.lineWidth = 1
    ctx.stroke()
    angle += slice

    if (slice > 0.12) {
      const mid = angle - slice / 2
      const pct = ((val / sum) * 100).toFixed(0)
      ctx.fillStyle = '#fff'
      ctx.font = `bold 11px ${FONT}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${pct}%`, cx + Math.cos(mid) * r * 0.55, cy + Math.sin(mid) * r * 0.55)
    }
  })

  let ly = 40
  const lx = w - legendW + 8
  series.forEach((s, i) => {
    const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]
    ctx.fillStyle = color
    ctx.fillRect(lx, ly - 10, 14, 14)
    ctx.fillStyle = '#e8e8e8'
    ctx.font = `12px ${FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(`${truncateLabel(s.name, 22)} (${totals[i]})`, lx + 20, ly)
    ly += 22
  })
}

function drawBarsOrLines(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  matrix: MatrixData,
  selected: MatrixSeries[],
  config: ChartConfig,
) {
  const pad = { l: 56, r: 156, t: 36, b: 64 }
  const chartW = w - pad.l - pad.r
  const chartH = h - pad.t - pad.b
  const months = matrix.monthLabels
  const nMonths = months.length
  const nSeries = selected.length
  const type = config.chartType

  let maxVal = 0
  for (const s of selected) {
    for (const v of s.values) if (v > maxVal) maxVal = v
  }
  maxVal = niceMax(maxVal)

  drawYAxisGrid(ctx, pad, chartW, chartH, maxVal)

  ctx.strokeStyle = '#4a4a6a'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(pad.l, pad.t)
  ctx.lineTo(pad.l, pad.t + chartH)
  ctx.lineTo(pad.l + chartW, pad.t + chartH)
  ctx.stroke()

  const labelStep = nMonths > 14 ? Math.ceil(nMonths / 14) : 1
  ctx.fillStyle = '#a0a0b0'
  ctx.font = `10px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  months.forEach((label, mi) => {
    if (mi % labelStep !== 0 && mi !== nMonths - 1) return
    const x = pad.l + (mi + 0.5) * (chartW / nMonths)
    ctx.save()
    ctx.translate(x, pad.t + chartH + 8)
    ctx.rotate(-0.45)
    ctx.fillText(truncateLabel(label, 12), 0, 0)
    ctx.restore()
  })

  const grouped = config.columnLayout === 'grouped' || type === 'line'
  const groupW = chartW / nMonths

  if (type === 'line') {
    selected.forEach((s, si) => {
      const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      s.values.forEach((v, mi) => {
        const x = pad.l + (mi + 0.5) * groupW
        const y = pad.t + chartH - (v / maxVal) * chartH
        if (mi === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      s.values.forEach((v, mi) => {
        if (mi % labelStep !== 0 && mi !== s.values.length - 1) return
        const x = pad.l + (mi + 0.5) * groupW
        const y = pad.t + chartH - (v / maxVal) * chartH
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#e8e8e8'
        ctx.font = `9px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(String(v), x, y - 6)
      })
    })
    return
  }

  months.forEach((_, mi) => {
    const gx = pad.l + mi * groupW
    if (grouped) {
      const barW = groupW / (nSeries + 1)
      selected.forEach((s, si) => {
        const v = s.values[mi] || 0
        const bh = (v / maxVal) * chartH
        const x = gx + barW * (si + 0.5)
        const y = pad.t + chartH - bh
        ctx.fillStyle = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length]
        ctx.fillRect(x, y, barW * 0.82, bh)
        if (bh > 16) {
          ctx.fillStyle = '#fff'
          ctx.font = `9px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(v), x + barW * 0.41, y + bh / 2)
        }
      })
    } else {
      let stackY = pad.t + chartH
      selected.forEach((s, si) => {
        const v = s.values[mi] || 0
        const bh = (v / maxVal) * chartH
        stackY -= bh
        ctx.fillStyle = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length]
        ctx.fillRect(gx + groupW * 0.08, stackY, groupW * 0.84, bh)
        if (bh > 16) {
          ctx.fillStyle = '#fff'
          ctx.font = `9px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(v), gx + groupW * 0.5, stackY + bh / 2)
        }
      })
    }
  })
}
