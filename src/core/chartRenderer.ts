import type { MatrixData, MatrixSeries } from '@/types'
import { DEFAULT_CHART_COLORS } from '@/utils/helpers'

export interface ChartConfig {
  chartType: 'column' | 'line' | 'pie'
  columnLayout: 'grouped' | 'stacked'
  stackConfig: Record<string, { selected: boolean; color: string }>
}

export function drawChart(
  canvas: HTMLCanvasElement,
  matrix: MatrixData,
  selected: MatrixSeries[],
  config: ChartConfig,
): string | null {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.parentElement?.getBoundingClientRect()
  const w = Math.max((rect?.width ?? 400) - 2, 400)
  const h = 380
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = '#16213e'
  ctx.fillRect(0, 0, w, h)

  const type = config.chartType

  if (type === 'pie' && selected.length >= 2) {
    drawPie(ctx, w, h, selected, config)
  } else if (type === 'pie') {
    ctx.fillStyle = '#a0a0b0'
    ctx.font = '14px Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Sélectionnez au moins 2 piles', w / 2, h / 2)
  } else {
    drawBarsOrLines(ctx, w, h, matrix, selected, config)
  }

  if (type !== 'pie') {
    let ly = 16
    selected.forEach((s, i) => {
      const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]
      ctx.fillStyle = color
      ctx.fillRect(w - 140, ly, 12, 12)
      ctx.fillStyle = '#e8e8e8'
      ctx.font = '11px Segoe UI, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(s.name, w - 122, ly + 10)
      ly += 18
    })
  }

  return canvas.width ? canvas.toDataURL('image/png') : null
}

function drawPie(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  series: MatrixSeries[],
  config: ChartConfig,
) {
  const legendW = 160
  const cx = (w - legendW) / 2
  const cy = h / 2
  const r = Math.min(cx, cy) - 30
  const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0))
  const sum = totals.reduce((a, b) => a + b, 0)

  if (sum === 0) {
    ctx.fillStyle = '#a0a0b0'
    ctx.font = '14px Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Aucune donnée à afficher', w / 2, h / 2)
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
    angle += slice
  })

  let ly = 40
  const lx = w - legendW + 10
  series.forEach((s, i) => {
    const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length]
    ctx.fillStyle = color
    ctx.fillRect(lx, ly - 10, 14, 14)
    ctx.fillStyle = '#e8e8e8'
    ctx.font = '12px Segoe UI, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(`${s.name} (${totals[i]})`, lx + 20, ly)
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
  const pad = { l: 50, r: 20, t: 30, b: 60 }
  const chartW = w - pad.l - pad.r
  const chartH = h - pad.t - pad.b
  const months = matrix.monthLabels
  const nMonths = months.length
  const nSeries = selected.length
  const type = config.chartType

  if (!nMonths || !nSeries) {
    ctx.fillStyle = '#a0a0b0'
    ctx.font = '14px Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Sélectionnez des piles et une plage de dates', w / 2, h / 2)
    return
  }

  let maxVal = 0
  selected.forEach((s) => s.values.forEach((v) => { if (v > maxVal) maxVal = v }))
  if (maxVal === 0) maxVal = 1

  ctx.strokeStyle = '#2a2a4a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad.l, pad.t)
  ctx.lineTo(pad.l, pad.t + chartH)
  ctx.lineTo(pad.l + chartW, pad.t + chartH)
  ctx.stroke()

  ctx.fillStyle = '#a0a0b0'
  ctx.font = '11px Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  months.forEach((label, mi) => {
    const x = pad.l + (mi + 0.5) * (chartW / nMonths)
    ctx.save()
    ctx.translate(x, pad.t + chartH + 14)
    ctx.rotate(-0.4)
    ctx.fillText(label, 0, 0)
    ctx.restore()
  })

  const grouped = config.columnLayout === 'grouped' || type === 'line'
  const groupW = chartW / nMonths

  if (type === 'line') {
    selected.forEach((s, si) => {
      const color = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length]
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      s.values.forEach((v, mi) => {
        const x = pad.l + (mi + 0.5) * groupW
        const y = pad.t + chartH - (v / maxVal) * chartH
        if (mi === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      s.values.forEach((v, mi) => {
        const x = pad.l + (mi + 0.5) * groupW
        const y = pad.t + chartH - (v / maxVal) * chartH
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#e8e8e8'
        ctx.font = '10px Segoe UI, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(v), x, y - 8)
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
        ctx.fillRect(x, y, barW * 0.85, bh)
        ctx.fillStyle = '#e8e8e8'
        ctx.font = '10px Segoe UI, sans-serif'
        ctx.textAlign = 'center'
        if (bh > 14) ctx.fillText(String(v), x + barW * 0.42, y + 12)
      })
    } else {
      let stackY = pad.t + chartH
      selected.forEach((s, si) => {
        const v = s.values[mi] || 0
        const bh = (v / maxVal) * chartH
        stackY -= bh
        ctx.fillStyle = config.stackConfig[s.id]?.color ?? DEFAULT_CHART_COLORS[si % DEFAULT_CHART_COLORS.length]
        ctx.fillRect(gx + groupW * 0.1, stackY, groupW * 0.8, bh)
        if (bh > 14) {
          ctx.fillStyle = '#fff'
          ctx.font = '10px Segoe UI, sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(String(v), gx + groupW * 0.5, stackY + bh / 2 + 4)
        }
      })
    }
  })
}
