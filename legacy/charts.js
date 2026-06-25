(function (App) {
  'use strict';
  if (!App) return;

  const DEFAULT_COLORS = ['#e94560', '#4ecca3', '#ffc107', '#0f3460', '#ff6b6b', '#a29bfe', '#fd79a8', '#00cec9'];

  const chartState = {
    periodMode: 'year',
    year: '',
    month: '',
    chartType: 'column',
    columnLayout: 'grouped',
    stackConfig: {},
  };

  let lastChartTableId = null;

  const els = {};

  function initEls() {
    els.tableName = document.getElementById('charts-table-name');
    els.empty = document.getElementById('charts-empty');
    els.periodMode = document.getElementById('charts-period-mode');
    els.periodYear = document.getElementById('charts-period-year');
    els.periodMonth = document.getElementById('charts-period-month');
    els.yearGroup = document.getElementById('charts-year-group');
    els.monthGroup = document.getElementById('charts-month-group');
    els.chartType = document.getElementById('charts-type');
    els.columnLayout = document.getElementById('charts-column-layout');
    els.columnLayoutGroup = document.getElementById('charts-column-layout-group');
    els.stackList = document.getElementById('charts-stack-list');
    els.canvas = document.getElementById('charts-canvas');
    els.chartMessage = document.getElementById('charts-message');
    els.btnDraw = document.getElementById('charts-draw-btn');
  }

  function getPeriodState() {
    return {
      periodMode: chartState.periodMode,
      year: chartState.year,
      month: chartState.month,
    };
  }

  function applyChartDefaultsForTable(table) {
    if (!table || table.id === lastChartTableId) return;
    lastChartTableId = table.id;
    chartState.stackConfig = {};
    const months = App.Monthly.getAvailableMonths(table);
    const years = [...new Set(months.map((k) => k.split('-')[0]))].sort();
    chartState.periodMode = 'year';
    chartState.year = years[years.length - 1] || years[0] || '';
    chartState.month = months[months.length - 1] || months[0] || '';
    if (els.periodMode) els.periodMode.value = 'year';
  }

  function ensureStackConfig(table) {
    const matrix = App.Monthly.buildMatrixData(table, getPeriodState());
    const firstFilterId = matrix.series.find((s) => !s.isCalculation)?.id;
    matrix.series.forEach((series, i) => {
      if (!chartState.stackConfig[series.id]) {
        chartState.stackConfig[series.id] = {
          selected: series.id === firstFilterId,
          color: DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        };
      }
    });
    Object.keys(chartState.stackConfig).forEach((id) => {
      if (!matrix.series.find((s) => s.id === id)) delete chartState.stackConfig[id];
    });
  }

  function populatePeriodSelectors(table) {
    const months = App.Monthly.getAvailableMonths(table);
    const years = [...new Set(months.map((k) => k.split('-')[0]))].sort();
    els.periodYear.innerHTML = years.map((y) =>
      `<option value="${y}" ${chartState.year === y ? 'selected' : ''}>${y}</option>`
    ).join('');
    els.periodMonth.innerHTML = months.map((k) =>
      `<option value="${k}" ${chartState.month === k ? 'selected' : ''}>${App.Monthly.formatMonthLabel(k)}</option>`
    ).join('');
    if (!chartState.year && years.length) chartState.year = years[years.length - 1];
    if (!chartState.month && months.length) chartState.month = months[months.length - 1];
  }

  function getSelectedSeries(matrix) {
    return matrix.series.filter((s) => chartState.stackConfig[s.id]?.selected !== false);
  }

  function renderStackPicker(table) {
    ensureStackConfig(table);
    const matrix = App.Monthly.buildMatrixData(table, getPeriodState());
    if (!matrix.series.length) {
      els.stackList.innerHTML = '<p class="filter-hint">Aucune pile ou calcul mensuel.</p>';
      return;
    }
    els.stackList.innerHTML = matrix.series.map((series) => {
      const cfg = chartState.stackConfig[series.id];
      const suffix = series.isCalculation ? ' ƒ' : '';
      return `
        <label class="chart-stack-item">
          <input type="checkbox" class="chart-stack-check" data-stack="${series.id}" ${cfg.selected ? 'checked' : ''}>
          <input type="color" class="chart-stack-color" data-stack="${series.id}" value="${cfg.color}">
          <span>${App.escapeHtml(series.name)}${suffix}</span>
        </label>`;
    }).join('');
  }

  function drawPie(ctx, w, h, series, labels) {
    const legendW = 160;
    const cx = (w - legendW) / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 30;
    const totals = series.map((s) => s.values.reduce((a, b) => a + b, 0));
    const sum = totals.reduce((a, b) => a + b, 0);

    if (sum === 0) {
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée à afficher', w / 2, h / 2);
      return;
    }

    let angle = -Math.PI / 2;
    series.forEach((s, i) => {
      const val = totals[i];
      if (val <= 0) return;
      const slice = (val / sum) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      ctx.fill();
      angle += slice;
    });

    let ly = 40;
    const lx = w - legendW + 10;
    series.forEach((s, i) => {
      const color = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 10, 14, 14);
      ctx.fillStyle = '#e8e8e8';
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${s.name} (${totals[i]})`, lx + 20, ly);
      ly += 22;
    });
  }

  function drawBarsOrLines(ctx, w, h, matrix, selected, type) {
    const pad = { l: 50, r: 20, t: 30, b: 60 };
    const chartW = w - pad.l - pad.r;
    const chartH = h - pad.t - pad.b;
    const months = matrix.monthLabels;
    const nMonths = months.length;
    const nSeries = selected.length;

    if (!nMonths || !nSeries) {
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sélectionnez des piles et une plage de dates', w / 2, h / 2);
      return;
    }

    let maxVal = 0;
    selected.forEach((s) => s.values.forEach((v) => { if (v > maxVal) maxVal = v; }));
    if (maxVal === 0) maxVal = 1;

    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + chartH);
    ctx.lineTo(pad.l + chartW, pad.t + chartH);
    ctx.stroke();

    ctx.fillStyle = '#a0a0b0';
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    months.forEach((label, mi) => {
      const x = pad.l + (mi + 0.5) * (chartW / nMonths);
      ctx.save();
      ctx.translate(x, pad.t + chartH + 14);
      ctx.rotate(-0.4);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });

    const grouped = chartState.columnLayout === 'grouped' || type === 'line';
    const groupW = chartW / nMonths;

    if (type === 'line') {
      selected.forEach((s, si) => {
        const color = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        s.values.forEach((v, mi) => {
          const x = pad.l + (mi + 0.5) * groupW;
          const y = pad.t + chartH - (v / maxVal) * chartH;
          if (mi === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        s.values.forEach((v, mi) => {
          const x = pad.l + (mi + 0.5) * groupW;
          const y = pad.t + chartH - (v / maxVal) * chartH;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#e8e8e8';
          ctx.font = '10px Segoe UI, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(v), x, y - 8);
        });
      });
      return;
    }

    months.forEach((_, mi) => {
      const gx = pad.l + mi * groupW;
      if (grouped) {
        const barW = groupW / (nSeries + 1);
        selected.forEach((s, si) => {
          const v = s.values[mi] || 0;
          const bh = (v / maxVal) * chartH;
          const x = gx + barW * (si + 0.5);
          const y = pad.t + chartH - bh;
          ctx.fillStyle = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length];
          ctx.fillRect(x, y, barW * 0.85, bh);
          ctx.fillStyle = '#e8e8e8';
          ctx.font = '10px Segoe UI, sans-serif';
          ctx.textAlign = 'center';
          if (bh > 14) ctx.fillText(String(v), x + barW * 0.42, y + 12);
        });
      } else {
        let stackY = pad.t + chartH;
        selected.forEach((s, si) => {
          const v = s.values[mi] || 0;
          const bh = (v / maxVal) * chartH;
          stackY -= bh;
          ctx.fillStyle = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[si % DEFAULT_COLORS.length];
          ctx.fillRect(gx + groupW * 0.1, stackY, groupW * 0.8, bh);
          if (bh > 14) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(v), gx + groupW * 0.5, stackY + bh / 2 + 4);
          }
        });
      }
    });
  }

  function drawChart() {
    const table = App.getActiveTable();
    if (!table || !els.canvas) return;

    const matrix = App.Monthly.buildMatrixData(table, getPeriodState());
    const selected = getSelectedSeries(matrix);
    const type = chartState.chartType;

    els.chartMessage.textContent = '';
    els.chartMessage.classList.add('hidden');

    if (type === 'pie' && selected.length < 2) {
      els.chartMessage.textContent = 'Le camembert requiert au minimum 2 piles sélectionnées.';
      els.chartMessage.classList.remove('hidden');
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = els.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(rect.width - 2, 400);
    const h = 380;
    els.canvas.width = w * dpr;
    els.canvas.height = h * dpr;
    els.canvas.style.width = w + 'px';
    els.canvas.style.height = h + 'px';

    const ctx = els.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);

    if (type === 'pie' && selected.length >= 2) {
      drawPie(ctx, w, h, selected, matrix.monthLabels);
    } else if (type === 'pie') {
      ctx.fillStyle = '#a0a0b0';
      ctx.font = '14px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sélectionnez au moins 2 piles', w / 2, h / 2);
    } else {
      drawBarsOrLines(ctx, w, h, matrix, selected, type);
    }

    if (type !== 'pie') {
      let ly = 16;
      selected.forEach((s, i) => {
        const color = chartState.stackConfig[s.id]?.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        ctx.fillStyle = color;
        ctx.fillRect(w - 140, ly, 12, 12);
        ctx.fillStyle = '#e8e8e8';
        ctx.font = '11px Segoe UI, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(s.name, w - 122, ly + 10);
        ly += 18;
      });
    }
  }

  function render() {
    const table = App.getActiveTable();
    els.tableName.textContent = table ? table.name : '—';

    if (!table || !table.rows.length) {
      els.empty.classList.remove('hidden');
      els.stackList.innerHTML = '';
      return;
    }

    els.empty.classList.add('hidden');
    applyChartDefaultsForTable(table);
    populatePeriodSelectors(table);
    if (els.periodMode && els.periodMode.value !== chartState.periodMode) {
      els.periodMode.value = chartState.periodMode;
    }
    els.yearGroup.classList.toggle('hidden', chartState.periodMode !== 'year');
    els.monthGroup.classList.toggle('hidden', chartState.periodMode !== 'month');
    els.columnLayoutGroup.classList.toggle('hidden', chartState.chartType === 'pie' || chartState.chartType === 'line');

    renderStackPicker(table);
    drawChart();
  }

  function bindEvents() {
    els.periodMode?.addEventListener('change', () => {
      chartState.periodMode = els.periodMode.value;
      render();
    });
    els.periodYear?.addEventListener('change', () => {
      chartState.year = els.periodYear.value;
      render();
    });
    els.periodMonth?.addEventListener('change', () => {
      chartState.month = els.periodMonth.value;
      render();
    });
    els.chartType?.addEventListener('change', () => {
      chartState.chartType = els.chartType.value;
      render();
    });
    els.columnLayout?.addEventListener('change', () => {
      chartState.columnLayout = els.columnLayout.value;
      drawChart();
    });
    els.btnDraw?.addEventListener('click', drawChart);

    els.stackList?.addEventListener('change', (e) => {
      const stackId = e.target.dataset?.stack;
      if (!stackId) return;
      if (!chartState.stackConfig[stackId]) chartState.stackConfig[stackId] = { selected: true, color: DEFAULT_COLORS[0] };
      if (e.target.classList.contains('chart-stack-check')) {
        chartState.stackConfig[stackId].selected = e.target.checked;
      }
      if (e.target.classList.contains('chart-stack-color')) {
        chartState.stackConfig[stackId].color = e.target.value;
      }
      drawChart();
    });

    window.addEventListener('resize', App.debounce(drawChart, 200));
  }

  App.Charts = { init: initEls, render, drawChart };

  if (window.AppCore && App.Monthly) {
    App.Charts.init();
    bindEvents();
  }
})(window.AppCore);
