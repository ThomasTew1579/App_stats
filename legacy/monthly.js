(function (App) {
  'use strict';
  if (!App) return;

  const MONTH_NAMES = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  const CALC_OPS = [
    { value: 'add', label: 'Addition', nary: true },
    { value: 'subtract', label: 'Soustraction', nary: false },
    { value: 'difference', label: 'Différence (|A − B|)', nary: false },
    { value: 'multiply', label: 'Multiplication', nary: true },
    { value: 'divide', label: 'Division (A ÷ B)', nary: false },
    { value: 'ratio', label: 'Ratio (A / B × 100)', nary: false },
  ];

  const valuesState = { periodMode: 'all', year: '', month: '', pdfRowSelection: {} };

  function isPdfRowSelected(seriesId) {
    if (valuesState.pdfRowSelection[seriesId] === undefined) return true;
    return valuesState.pdfRowSelection[seriesId] !== false;
  }

  function getValuesPeriodState() {
    return {
      periodMode: valuesState.periodMode,
      year: valuesState.year,
      month: valuesState.month,
    };
  }

  function getPdfSelectedSeriesIds(table) {
    const matrix = buildMatrixData(table, getValuesPeriodState());
    return matrix.series.filter((s) => isPdfRowSelected(s.id)).map((s) => s.id);
  }

  const els = {};

  function initEls() {
    els.monthDateCol = document.getElementById('month-date-column');
    els.monthlyStacksContainer = document.getElementById('monthly-stacks-container');
    els.valuesContainer = document.getElementById('values-matrix-container');
    els.valuesEmpty = document.getElementById('values-empty');
    els.valuesTableName = document.getElementById('values-table-name');
    els.periodMode = document.getElementById('values-period-mode');
    els.periodYear = document.getElementById('values-period-year');
    els.periodMonth = document.getElementById('values-period-month');
    els.yearGroup = document.getElementById('values-year-group');
    els.monthGroup = document.getElementById('values-month-group');
    els.detailModal = document.getElementById('detail-modal');
    els.detailTitle = document.getElementById('detail-modal-title');
    els.detailBody = document.getElementById('detail-modal-body');
    els.detailClose = document.getElementById('detail-modal-close');
    els.btnAddMonthly = document.getElementById('btn-add-monthly-stack');
    els.btnAddCalc = document.getElementById('btn-add-monthly-calc');
  }

  function defaultCalculation() {
    return {
      id: App.uid(),
      name: 'Calcul',
      op: 'add',
      operands: [],
    };
  }

  function getCalcOperands(calc) {
    if (calc.operands?.length) return calc.operands;
    if (calc.stackIds?.length) return calc.stackIds.map((id) => ({ type: 'stack', id }));
    return [];
  }

  function formatOperandValue(ref) {
    return `${ref.type}:${ref.id}`;
  }

  function parseOperandValue(val) {
    if (!val) return null;
    const idx = val.indexOf(':');
    if (idx === -1) return { type: 'stack', id: val };
    return { type: val.slice(0, idx), id: val.slice(idx + 1) };
  }

  function isOperandSelected(calc, type, id) {
    return getCalcOperands(calc).some((o) => o.type === type && o.id === id);
  }

  function getPreviousCalcs(table, calcIndex) {
    return (table.monthlyCalculations || []).slice(0, calcIndex);
  }

  function getOperandLabel(table, ref) {
    if (ref.type === 'stack') {
      return getFilterStacks(table).find((s) => s.id === ref.id)?.name || 'Pile ?';
    }
    return (table.monthlyCalculations || []).find((c) => c.id === ref.id)?.name || 'Calcul ?';
  }

  function ensureMonthlyConfig(table) {
    if (!table.monthlyFilterStacks) table.monthlyFilterStacks = [];
    if (!table.monthlyCalculations) table.monthlyCalculations = [];
    if (!table.monthDateColumnId) {
      const d = table.columns.find((c) => c.formatter?.type === 'date');
      table.monthDateColumnId = d?.id || '';
    }
    return table;
  }

  function getFilterStacks(table) {
    return table.monthlyFilterStacks || [];
  }

  function getRowMonthKey(row, table) {
    const col = table.columns.find((c) => c.id === table.monthDateColumnId);
    if (!col) return null;
    const raw = App.FilterEngine.getCellRawForFilter(row, col);
    if (raw == null || isNaN(raw)) return null;
    const d = new Date(raw);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getAvailableMonths(table) {
    const set = new Set();
    table.rows.forEach((row) => {
      const k = getRowMonthKey(row, table);
      if (k) set.add(k);
    });
    return [...set].sort();
  }

  function formatMonthLabel(key) {
    const [y, m] = key.split('-');
    return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
  }

  function getRowsForMonth(table, monthKey) {
    return table.rows.filter((row) => getRowMonthKey(row, table) === monthKey);
  }

  function computeStackCellData(table, stack, monthKey) {
    if (!stack?.filters) return { count: 0, rows: [] };
    const context = { monthKey, monthlyContext: true };
    const hasDateFilter = stack.filters.some((f) => f.type === 'date');

    if (hasDateFilter) {
      const filtered = App.FilterEngine.applyStack(table.rows, stack, table, context);
      return { count: filtered.length, rows: filtered };
    }

    const monthRows = getRowsForMonth(table, monthKey);
    const filtered = App.FilterEngine.applyStack(monthRows, stack, table, context);
    return { count: filtered.length, rows: filtered };
  }

  function resolveOperandValue(table, ref, monthKey, calcIndex, memo) {
    if (ref.type === 'stack') {
      const stack = getFilterStacks(table).find((s) => s.id === ref.id);
      return stack ? computeStackCellData(table, stack, monthKey).count : 0;
    }
    if (ref.type === 'calc') {
      const calcs = table.monthlyCalculations || [];
      const otherIndex = calcs.findIndex((c) => c.id === ref.id);
      if (otherIndex < 0 || otherIndex >= calcIndex) return null;
      if (memo[ref.id] !== undefined) return memo[ref.id];
      const { value } = computeCalculation(table, calcs[otherIndex], monthKey, memo);
      return value;
    }
    return null;
  }

  function computeCalculation(table, calc, monthKey, memo = {}) {
    const calcs = table.monthlyCalculations || [];
    const calcIndex = calcs.findIndex((c) => c.id === calc.id);
    const operands = getCalcOperands(calc);
    const operandDetails = operands.map((ref) => ({
      ref,
      value: resolveOperandValue(table, ref, monthKey, calcIndex, memo),
    }));
    const values = operandDetails.map((d) => d.value);
    if (values.some((v) => v === null)) {
      return { value: null, operandDetails, operands };
    }
    const value = applyCalcOp(calc.op, values);
    if (value != null) memo[calc.id] = value;
    return { value, operandDetails, operands };
  }

  function applyCalcOp(op, values) {
    const nums = values.map((v) => Number(v) || 0);
    if (nums.length === 0) return null;

    switch (op) {
      case 'add':
        return nums.reduce((a, b) => a + b, 0);
      case 'subtract':
        return nums.length >= 2 ? nums[0] - nums[1] : nums[0];
      case 'difference':
        return nums.length >= 2 ? Math.abs(nums[0] - nums[1]) : Math.abs(nums[0]);
      case 'multiply':
        return nums.reduce((a, b) => a * b, 1);
      case 'divide':
        return nums.length >= 2 && nums[1] !== 0 ? nums[0] / nums[1] : null;
      case 'ratio':
        return nums.length >= 2 && nums[1] !== 0 ? (nums[0] / nums[1]) * 100 : null;
      default:
        return null;
    }
  }

  function formatCalcDisplay(value, op) {
    if (value == null || isNaN(value)) return '—';
    if (op === 'ratio') return `${value.toFixed(1)} %`;
    if (op === 'divide') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function buildCalcDetailHtml(table, calc, monthKey) {
    const { value, operandDetails } = computeCalculation(table, calc, monthKey);
    const opLabel = CALC_OPS.find((o) => o.value === calc.op)?.label || calc.op;
    let html = `<p><strong>${App.escapeHtml(calc.name)}</strong> — ${formatMonthLabel(monthKey)}</p>`;
    html += `<p>Opération : ${App.escapeHtml(opLabel)}</p><ul class="calc-detail-list">`;
    operandDetails.forEach(({ ref, value: v }) => {
      const label = getOperandLabel(table, ref);
      const prefix = ref.type === 'calc' ? 'Calcul ' : 'Pile ';
      const otherCalc = ref.type === 'calc'
        ? (table.monthlyCalculations || []).find((c) => c.id === ref.id)
        : null;
      const valDisplay = ref.type === 'calc'
        ? formatCalcDisplay(v, otherCalc?.op)
        : `<strong>${v ?? 0}</strong> ligne(s)`;
      html += `<li>${prefix}${App.escapeHtml(label)} : ${valDisplay}</li>`;
    });
    html += `</ul><p>Résultat : <strong>${formatCalcDisplay(value, calc.op)}</strong></p>`;
    return html;
  }

  function getVisibleMonthsForState(table, state) {
    const all = getAvailableMonths(table);
    if (state.periodMode === 'year' && state.year) {
      return all.filter((k) => k.startsWith(state.year + '-'));
    }
    if (state.periodMode === 'month' && state.month) {
      return all.filter((k) => k === state.month);
    }
    return all;
  }

  function buildMatrixData(table, periodState) {
    ensureMonthlyConfig(table);
    const months = getVisibleMonthsForState(table, periodState);
    const filterSeries = getFilterStacks(table).map((stack) => ({
      id: stack.id,
      name: stack.name,
      isCalculation: false,
      op: null,
      values: months.map((mk) => computeStackCellData(table, stack, mk).count),
    }));
    const calcSeries = (table.monthlyCalculations || []).map((calc) => ({
      id: calc.id,
      name: calc.name,
      isCalculation: true,
      op: calc.op,
      values: months.map((mk) => {
        const { value } = computeCalculation(table, calc, mk);
        return value ?? 0;
      }),
    }));
    return {
      months,
      monthLabels: months.map(formatMonthLabel),
      series: [...filterSeries, ...calcSeries],
    };
  }

  function getVisibleMonths(table) {
    return getVisibleMonthsForState(table, valuesState);
  }

  function populatePeriodSelectors(table) {
    const months = getAvailableMonths(table);
    const years = [...new Set(months.map((k) => k.split('-')[0]))].sort();

    els.periodYear.innerHTML = years.map((y) =>
      `<option value="${y}" ${valuesState.year === y ? 'selected' : ''}>${y}</option>`
    ).join('');
    els.periodMonth.innerHTML = months.map((k) =>
      `<option value="${k}" ${valuesState.month === k ? 'selected' : ''}>${formatMonthLabel(k)}</option>`
    ).join('');

    if (!valuesState.year && years.length) valuesState.year = years[0];
    if (!valuesState.month && months.length) valuesState.month = months[0];
  }

  function openDetailModal(title, table, rows) {
    els.detailTitle.textContent = title;
    els.detailBody.innerHTML = App.Stats.renderResultTable(table, rows, Infinity);
    els.detailModal.classList.remove('hidden');
  }

  function openCalcDetailModal(calc, table, monthKey) {
    els.detailTitle.textContent = `${calc.name} — ${formatMonthLabel(monthKey)}`;
    els.detailBody.innerHTML = buildCalcDetailHtml(table, calc, monthKey);
    els.detailModal.classList.remove('hidden');
  }

  function isNaryOp(op) {
    return CALC_OPS.find((o) => o.value === op)?.nary === true;
  }

  function renderOperandSelectOptions(table, calcIndex, selectedRef) {
    const stacks = getFilterStacks(table);
    const previousCalcs = getPreviousCalcs(table, calcIndex);
    const selected = selectedRef ? formatOperandValue(selectedRef) : '';
    let html = '<option value="">—</option>';
    if (stacks.length) {
      html += '<optgroup label="Piles">';
      stacks.forEach((s) => {
        const val = formatOperandValue({ type: 'stack', id: s.id });
        html += `<option value="${val}" ${val === selected ? 'selected' : ''}>${App.escapeHtml(s.name)}</option>`;
      });
      html += '</optgroup>';
    }
    if (previousCalcs.length) {
      html += '<optgroup label="Calculs">';
      previousCalcs.forEach((c) => {
        const val = formatOperandValue({ type: 'calc', id: c.id });
        html += `<option value="${val}" ${val === selected ? 'selected' : ''}>${App.escapeHtml(c.name)} ƒ</option>`;
      });
      html += '</optgroup>';
    }
    return html;
  }

  function renderCalculationCard(calc, table, calcIndex) {
    const filterStacks = getFilterStacks(table);
    const previousCalcs = getPreviousCalcs(table, calcIndex);
    const nary = isNaryOp(calc.op);
    const operands = getCalcOperands(calc);
    const opOptions = CALC_OPS.map((o) =>
      `<option value="${o.value}" ${calc.op === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    let operandsHtml;
    if (nary) {
      const stackChecks = filterStacks.length
        ? filterStacks.map((s) => `
            <label class="calc-operand-check">
              <input type="checkbox" class="calc-operand-check" data-type="stack" value="${s.id}" ${isOperandSelected(calc, 'stack', s.id) ? 'checked' : ''}>
              ${App.escapeHtml(s.name)}
            </label>`).join('')
        : '';
      const calcChecks = previousCalcs.length
        ? previousCalcs.map((c) => `
            <label class="calc-operand-check">
              <input type="checkbox" class="calc-operand-check" data-type="calc" value="${c.id}" ${isOperandSelected(calc, 'calc', c.id) ? 'checked' : ''}>
              ${App.escapeHtml(c.name)} ƒ
            </label>`).join('')
        : '';
      operandsHtml = `
        <label>Sources (piles ou calculs précédents)</label>
        <div class="calc-operands-multi">
          ${filterStacks.length ? `<p class="calc-operand-group">Piles</p>${stackChecks}` : ''}
          ${previousCalcs.length ? `<p class="calc-operand-group">Calculs</p>${calcChecks}` : ''}
          ${!filterStacks.length && !previousCalcs.length ? '<p class="filter-hint">Créez des piles ou des calculs précédents.</p>' : ''}
        </div>`;
    } else {
      operandsHtml = `
        <label>Source A</label>
        <select class="calc-operand-a">${renderOperandSelectOptions(table, calcIndex, operands[0])}</select>
        <label>Source B</label>
        <select class="calc-operand-b">${renderOperandSelectOptions(table, calcIndex, operands[1])}</select>`;
    }

    return `
      <div class="calc-stack filter-stack" data-calc-id="${calc.id}">
        <div class="filter-stack-header">
          <input type="text" class="stack-name calc-name" value="${App.escapeHtml(calc.name)}" title="Nom du calcul">
          <span class="stack-count calc-badge">Calcul</span>
          <button type="button" class="btn-icon btn-calc-remove" title="Supprimer">×</button>
        </div>
        <div class="filter-stack-body calc-body">
          <div class="calc-editor">
            <label>Opération</label>
            <select class="calc-op">${opOptions}</select>
            ${operandsHtml}
          </div>
          <p class="filter-hint">Utilise les comptages des piles ou les résultats des calculs définis au-dessus.</p>
        </div>
      </div>`;
  }

  function readCalcFromDom(calcEl, calc) {
    calc.name = calcEl.querySelector('.calc-name')?.value.trim() || calc.name;
    calc.op = calcEl.querySelector('.calc-op')?.value || 'add';
    if (isNaryOp(calc.op)) {
      calc.operands = [...calcEl.querySelectorAll('input.calc-operand-check:checked')].map((cb) => ({
        type: cb.dataset.type,
        id: cb.value,
      }));
    } else {
      const a = parseOperandValue(calcEl.querySelector('.calc-operand-a')?.value);
      const b = parseOperandValue(calcEl.querySelector('.calc-operand-b')?.value);
      calc.operands = [a, b].filter(Boolean);
    }
    delete calc.stackIds;
  }

  function serializeCalculationForExport(table, calc) {
    const stacks = table.monthlyFilterStacks || [];
    const calcs = table.monthlyCalculations || [];
    const operands = getCalcOperands(calc).map((ref) => {
      if (ref.type === 'stack') {
        const name = stacks.find((s) => s.id === ref.id)?.name;
        return name ? { type: 'stack', name } : null;
      }
      const name = calcs.find((c) => c.id === ref.id)?.name;
      return name ? { type: 'calc', name } : null;
    }).filter(Boolean);
    return {
      name: calc.name,
      op: calc.op,
      operands,
      stackNames: operands.filter((o) => o.type === 'stack').map((o) => o.name),
    };
  }

  function bindCalculationEvents(table) {
    const container = els.monthlyStacksContainer;
    if (!container) return;

    container.querySelectorAll('.calc-stack').forEach((calcEl) => {
      const calcId = calcEl.dataset.calcId;
      const calc = (table.monthlyCalculations || []).find((c) => c.id === calcId);
      if (!calc) return;

      const refresh = () => {
        readCalcFromDom(calcEl, calc);
        renderValues();
        if (App.Charts) App.Charts.drawChart();
      };

      calcEl.querySelector('.calc-name')?.addEventListener('change', refresh);
      calcEl.querySelector('.calc-op')?.addEventListener('change', () => {
        readCalcFromDom(calcEl, calc);
        renderStacks();
      });
      calcEl.querySelectorAll('input.calc-operand-check, .calc-operand-a, .calc-operand-b').forEach((el) => {
        el.addEventListener('change', refresh);
      });
      calcEl.querySelector('.btn-calc-remove')?.addEventListener('click', () => {
        table.monthlyCalculations = table.monthlyCalculations.filter((c) => c.id !== calcId);
        renderStacks();
        renderValues();
        if (App.Charts) App.Charts.drawChart();
      });
    });
  }

  function renderCalculations(table) {
    if (!els.monthlyStacksContainer || !table) return;
    const calcs = table.monthlyCalculations || [];
    const existing = els.monthlyStacksContainer.querySelectorAll('.calc-stack');
    existing.forEach((el) => el.remove());
    calcs.forEach((calc, i) => {
      els.monthlyStacksContainer.insertAdjacentHTML('beforeend', renderCalculationCard(calc, table, i));
    });
    bindCalculationEvents(table);
  }

  function renderStacks() {
    ensureMonthlyConfig(App.getActiveTable());
    const table = App.getActiveTable();

    if (table && els.monthDateCol) {
      const dateCols = table.columns.filter((c) => c.formatter?.type === 'date');
      els.monthDateCol.innerHTML = dateCols.map((c) =>
        `<option value="${c.id}" ${table.monthDateColumnId === c.id ? 'selected' : ''}>${App.escapeHtml(c.name)}</option>`
      ).join('') || '<option value="">— Aucune colonne date —</option>';
    }

    App.Stats.renderPanel('monthly');
    if (table) renderCalculations(table);
  }

  function renderValues() {
    const table = App.getActiveTable();
    els.valuesTableName.textContent = table ? table.name : '—';

    if (!table || !table.rows.length) {
      els.valuesContainer.innerHTML = '';
      els.valuesEmpty.classList.remove('hidden');
      return;
    }

    ensureMonthlyConfig(table);
    els.valuesEmpty.classList.add('hidden');
    populatePeriodSelectors(table);

    els.yearGroup.classList.toggle('hidden', valuesState.periodMode !== 'year');
    els.monthGroup.classList.toggle('hidden', valuesState.periodMode !== 'month');

    const matrix = buildMatrixData(table, valuesState);
    const months = matrix.months;

    if (!matrix.series.length || !months.length || !table.monthDateColumnId) {
      els.valuesContainer.innerHTML = '<p class="filter-hint">Configurez une colonne date et des piles dans « Filtre mensuel ».</p>';
      return;
    }

    const seriesIds = new Set(matrix.series.map((s) => s.id));
    Object.keys(valuesState.pdfRowSelection).forEach((id) => {
      if (!seriesIds.has(id)) delete valuesState.pdfRowSelection[id];
    });

    let html = '<div class="values-matrix-wrapper"><table class="values-matrix"><thead><tr><th>Pile</th><th class="values-pdf-col" title="Inclure dans le rapport PDF">PDF</th>';
    months.forEach((m) => { html += `<th>${formatMonthLabel(m)}</th>`; });
    html += '</tr></thead><tbody>';

    matrix.series.forEach((series) => {
      const rowClass = series.isCalculation ? ' calc-row' : '';
      const pdfChecked = isPdfRowSelected(series.id) ? 'checked' : '';
      html += `<tr class="${rowClass}"><th>${App.escapeHtml(series.name)}${series.isCalculation ? ' ƒ' : ''}</th>`;
      html += `<td class="values-pdf-col"><input type="checkbox" class="values-pdf-check" data-series="${series.id}" ${pdfChecked} title="Inclure dans le rapport PDF"></td>`;
      months.forEach((monthKey, mi) => {
        const display = series.isCalculation
          ? formatCalcDisplay(series.values[mi], series.op)
          : String(series.values[mi]);
        const dataAttr = series.isCalculation
          ? `data-calc="${series.id}"`
          : `data-stack="${series.id}"`;
        html += `<td><button type="button" class="values-cell-btn" ${dataAttr} data-month="${monthKey}" title="Voir le détail">${display}</button></td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    els.valuesContainer.innerHTML = html;

    els.valuesContainer.querySelectorAll('.values-pdf-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        valuesState.pdfRowSelection[cb.dataset.series] = cb.checked;
      });
    });

    els.valuesContainer.querySelectorAll('.values-cell-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const monthKey = btn.dataset.month;
        if (btn.dataset.calc) {
          const calc = table.monthlyCalculations.find((c) => c.id === btn.dataset.calc);
          if (calc) openCalcDetailModal(calc, table, monthKey);
          return;
        }
        const stack = getFilterStacks(table).find((s) => s.id === btn.dataset.stack);
        if (!stack) return;
        const { rows } = computeStackCellData(table, stack, monthKey);
        openDetailModal(`${stack.name} — ${formatMonthLabel(monthKey)} (${rows.length} ligne(s))`, table, rows);
      });
    });
  }

  function bindEvents() {
    els.monthDateCol?.addEventListener('change', () => {
      const table = App.getActiveTable();
      if (table) table.monthDateColumnId = els.monthDateCol.value;
      renderValues();
      if (App.Charts) App.Charts.drawChart();
    });

    els.btnAddMonthly?.addEventListener('click', () => {
      const table = App.getActiveTable();
      if (!table) return;
      ensureMonthlyConfig(table);
      table.monthlyFilterStacks.push(App.Stats.defaultStack());
      renderStacks();
      renderValues();
      if (App.Charts) App.Charts.drawChart();
    });

    els.btnAddCalc?.addEventListener('click', () => {
      const table = App.getActiveTable();
      if (!table) return;
      ensureMonthlyConfig(table);
      table.monthlyCalculations.push(defaultCalculation());
      renderStacks();
      renderValues();
      if (App.Charts) App.Charts.drawChart();
    });

    els.periodMode?.addEventListener('change', () => {
      valuesState.periodMode = els.periodMode.value;
      renderValues();
    });
    els.periodYear?.addEventListener('change', () => {
      valuesState.year = els.periodYear.value;
      renderValues();
    });
    els.periodMonth?.addEventListener('change', () => {
      valuesState.month = els.periodMonth.value;
      renderValues();
    });

    els.detailClose?.addEventListener('click', () => els.detailModal.classList.add('hidden'));
    els.detailModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => els.detailModal.classList.add('hidden'));
  }

  App.Monthly = {
    init() { initEls(); bindEvents(); },
    renderStacks,
    renderValues,
    buildMatrixData,
    formatMonthLabel,
    getAvailableMonths,
    defaultCalculation,
    ensureMonthlyConfig,
    getValuesPeriodState,
    getPdfSelectedSeriesIds,
    serializeCalculationForExport,
    getCalcOperands,
  };

  if (window.AppCore && App.Stats) App.Monthly.init();
})(window.AppCore);
