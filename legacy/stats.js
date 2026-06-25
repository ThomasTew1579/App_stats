(function (App) {
  'use strict';

  if (!App) return;

  const FILTER_TYPES = [
    { value: 'text', label: 'Texte' },
    { value: 'value', label: 'Valeur exacte' },
    { value: 'date', label: 'Date' },
    { value: 'number', label: 'Nombre' },
    { value: 'empty', label: 'Vide' },
    { value: 'notEmpty', label: 'Non vide' },
  ];

  const TEXT_MODES = [
    { value: 'contains', label: 'Contient' },
    { value: 'startsWith', label: 'Commence par' },
    { value: 'endsWith', label: 'Finit par' },
  ];

  const DATE_MODES = [
    { value: 'before', label: 'Avant' },
    { value: 'after', label: 'Après' },
    { value: 'between', label: 'Dans la période' },
  ];

  const MONTHLY_DATE_MODES = [
    { value: 'debut_mois', label: 'Au début du mois (1er à minuit)' },
    { value: 'fin_mois', label: 'À la fin du mois (1er du mois suivant à minuit)' },
    { value: 'pendant_mois', label: 'Pendant le mois (1er courant → 1er suivant à minuit)' },
  ];

  function isMonthlyDateMode(mode) {
    return MONTHLY_DATE_MODES.some((m) => m.value === mode);
  }

  function getMonthBounds(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    const nextMonthStart = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    return { monthStart, nextMonthStart };
  }

  function matchMonthlyDateFilter(ts, filter, monthKey) {
    if (ts == null || isNaN(ts) || !monthKey) return false;
    const { monthStart, nextMonthStart } = getMonthBounds(monthKey);
    const cmp = filter.monthlyDateCompare || 'apres';

    switch (filter.dateMode) {
      case 'debut_mois':
        return cmp === 'avant' ? ts < monthStart : ts >= monthStart;
      case 'fin_mois':
        return cmp === 'avant' ? ts < nextMonthStart : ts >= nextMonthStart;
      case 'pendant_mois':
        return ts >= monthStart && ts < nextMonthStart;
      default:
        return false;
    }
  }

  const NUMBER_MODES = [
    { value: 'gt', label: 'Supérieur à' },
    { value: 'lt', label: 'Inférieur à' },
    { value: 'eq', label: 'Égal à' },
    { value: 'between', label: 'Dans la plage' },
  ];

  const FILTER_CONNECTORS = [
    { value: 'ET', label: 'ET', title: 'La ligne doit aussi correspondre à ce filtre' },
    { value: 'OU', label: 'OU', title: 'La ligne peut correspondre à ce filtre ou aux précédentes' },
    { value: 'AVEC', label: 'AVEC', title: 'La ligne doit avoir une valeur et correspondre à ce filtre' },
    { value: 'SANS', label: 'SANS', title: 'Exclure les lignes correspondant à ce filtre' },
  ];

  let datetimePickerCallback = null;
  let datetimePickerTarget = null;

  const els = {};

  function initEls() {
    els.container = document.getElementById('stats-stacks-container');
    els.empty = document.getElementById('stats-empty');
    els.tableName = document.getElementById('stats-table-name');
    els.btnAddStack = document.getElementById('btn-add-stack');
    els.btnExport = document.getElementById('btn-export-filters');
    els.btnImport = document.getElementById('btn-import-filters');
    els.btnExportMonthly = document.getElementById('btn-export-filters-monthly');
    els.btnImportMonthly = document.getElementById('btn-import-filters-monthly');
    els.datetimeModal = document.getElementById('datetime-modal');
    els.datetimeTitle = document.getElementById('datetime-modal-title');
    els.calendarGrid = document.getElementById('calendar-grid');
    els.calendarMonthLabel = document.getElementById('calendar-month-label');
    els.calendarPrev = document.getElementById('calendar-prev');
    els.calendarNext = document.getElementById('calendar-next');
    els.datetimeTime = document.getElementById('datetime-time');
    els.datetimeConfirm = document.getElementById('datetime-confirm');
    els.datetimeCancel = document.getElementById('datetime-cancel-btn');
    els.datetimeModalClose = document.getElementById('datetime-modal-close');
    els.filterImportModal = document.getElementById('filter-import-modal');
    els.filterImportText = document.getElementById('filter-import-text');
    els.filterImportConfirm = document.getElementById('filter-import-confirm');
    els.filterImportCancel = document.getElementById('filter-import-cancel-btn');
    els.filterImportModalClose = document.getElementById('filter-import-modal-close');
  }

  function ensureFilterStacks(table) {
    if (!table.filterStacks) table.filterStacks = [];
    return table.filterStacks;
  }

  function ensureStacks(table, key) {
    if (!table[key]) table[key] = [];
    return table[key];
  }

  function defaultFilter(type, table, monthlyContext = false) {
    const col = table.columns[0];
    const base = { id: App.uid(), type, columnId: col?.id || '', connector: 'ET' };
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    switch (type) {
      case 'text':
        return { ...base, matchMode: 'contains', terms: [''] };
      case 'value':
        return { ...base, values: [] };
      case 'date':
        if (monthlyContext) {
          return { ...base, dateMode: 'pendant_mois' };
        }
        return { ...base, dateMode: 'after', date1: now.getTime(), date2: now.getTime() + 86400000 };
      case 'number':
        return { ...base, numberMode: 'gt', num1: 0, num2: 100 };
      case 'empty':
      case 'notEmpty':
        return base;
      default:
        return base;
    }
  }

  function defaultStack() {
    return { id: App.uid(), name: 'Pile de filtres', filters: [] };
  }

  function getCellDisplay(row, col) {
    return String(App.formatCellValue(row, col) ?? '');
  }

  function getCellRawForFilter(row, col) {
    const raw = row.data[col.id];
    if (col.formatter?.type === 'date') {
      if (typeof raw === 'number') return raw;
      return App.parseDateWithFormat(String(raw), col.formatter.inputFormat || 'DD/MM/YYYY HH:mm');
    }
    if (col.formatter?.type === 'number') {
      const n = parseFloat(String(raw).replace(/\s/g, '').replace(',', '.'));
      return isNaN(n) ? null : n;
    }
    return raw;
  }

  function isEmptyValue(val) {
    return val == null || val === '';
  }

  function matchTextFilter(cellStr, filter) {
    const terms = (filter.terms || []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (terms.length === 0) return true;
    const hay = cellStr.toLowerCase();
    return terms.some((term) => {
      if (filter.matchMode === 'startsWith') return hay.startsWith(term);
      if (filter.matchMode === 'endsWith') return hay.endsWith(term);
      return hay.includes(term);
    });
  }

  function matchValueFilter(cellStr, filter) {
    const selected = filter.values || [];
    if (selected.length === 0) return true;
    return selected.includes(cellStr);
  }

  function matchDateFilter(ts, filter) {
    if (ts == null || isNaN(ts)) return false;
    const d1 = filter.date1 ?? 0;
    const d2 = filter.date2 ?? d1;
    if (filter.dateMode === 'before') return ts < d1;
    if (filter.dateMode === 'after') return ts > d1;
    const min = Math.min(d1, d2);
    const max = Math.max(d1, d2);
    return ts >= min && ts <= max;
  }

  function matchNumberFilter(num, filter) {
    if (num == null || isNaN(num)) return false;
    const n1 = filter.num1 ?? 0;
    const n2 = filter.num2 ?? n1;
    if (filter.numberMode === 'gt') return num > n1;
    if (filter.numberMode === 'lt') return num < n1;
    if (filter.numberMode === 'eq') return num === n1;
    const min = Math.min(n1, n2);
    const max = Math.max(n1, n2);
    return num >= min && num <= max;
  }

  function rowMatchesFilter(row, filter, table, context = {}) {
    const col = table.columns.find((c) => c.id === filter.columnId);
    if (!col && filter.type !== 'empty' && filter.type !== 'notEmpty') return true;

    const raw = col ? getCellRawForFilter(row, col) : null;
    const display = col ? getCellDisplay(row, col) : '';

    switch (filter.type) {
      case 'text':
        return matchTextFilter(display, filter);
      case 'value':
        return matchValueFilter(display, filter);
      case 'date':
        if (context.monthlyContext && context.monthKey && isMonthlyDateMode(filter.dateMode)) {
          return matchMonthlyDateFilter(raw, filter, context.monthKey);
        }
        return matchDateFilter(raw, filter);
      case 'number':
        return matchNumberFilter(typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.')), filter);
      case 'empty':
        return isEmptyValue(raw);
      case 'notEmpty':
        return !isEmptyValue(raw);
      default:
        return true;
    }
  }

  function rowHasColumnValue(row, filter, table) {
    const col = table.columns.find((c) => c.id === filter.columnId);
    if (!col) return false;
    return !isEmptyValue(getCellRawForFilter(row, col));
  }

  function unionRows(a, b) {
    const ids = new Set(a.map((r) => r.id));
    const out = [...a];
    b.forEach((r) => {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        out.push(r);
      }
    });
    return out;
  }

  function applyFilter(rows, filter, table, context = {}) {
    return rows.filter((row) => rowMatchesFilter(row, filter, table, context));
  }

  function applyStack(rows, stack, table, context = {}) {
    if (!stack.filters.length) return [...rows];

    let result = rows.filter((row) => rowMatchesFilter(row, stack.filters[0], table, context));

    for (let i = 1; i < stack.filters.length; i++) {
      const filter = stack.filters[i];
      const connector = filter.connector || 'ET';
      const matches = rows.filter((row) => rowMatchesFilter(row, filter, table, context));
      const matchIds = new Set(matches.map((r) => r.id));

      switch (connector) {
        case 'OU':
          result = unionRows(result, matches);
          break;
        case 'AVEC':
          result = result.filter((row) => rowHasColumnValue(row, filter, table) && matchIds.has(row.id));
          break;
        case 'SANS':
          result = result.filter((row) => !matchIds.has(row.id));
          break;
        case 'ET':
        default:
          result = result.filter((row) => matchIds.has(row.id));
          break;
      }
    }

    return result;
  }

  function getDistinctValues(table, columnId) {
    const col = table.columns.find((c) => c.id === columnId);
    if (!col) return [];
    const set = new Set();
    table.rows.forEach((row) => {
      const v = getCellDisplay(row, col);
      if (v !== '') set.add(v);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function getDateColumns(table) {
    return table.columns.filter((c) => c.formatter?.type === 'date');
  }

  function getNumberColumns(table) {
    return table.columns.filter((c) => c.formatter?.type === 'number' || c.formatter?.type === 'none');
  }

  function formatTsLabel(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function columnOptions(table, selectedId, filterFn) {
    const cols = filterFn ? filterFn(table) : table.columns;
    return cols.map((c) =>
      `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${App.escapeHtml(c.name)}</option>`
    ).join('');
  }

  function renderFilterEditor(filter, table, stackId, editorOptions = {}) {
    const colSelect = `<select class="filter-col" data-stack="${stackId}" data-filter="${filter.id}">
      ${columnOptions(table, filter.columnId)}
    </select>`;

    let body = `<div class="filter-editor" data-filter-id="${filter.id}">`;

    switch (filter.type) {
      case 'text':
        body += `
          <label>Colonne</label>${colSelect}
          <label>Mode</label>
          <select class="filter-text-mode" data-filter="${filter.id}">
            ${TEXT_MODES.map((m) => `<option value="${m.value}" ${filter.matchMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          <label>Mots / chaînes (un par ligne)</label>
          <textarea class="filter-terms" rows="2" placeholder="mot1&#10;mot2">${App.escapeHtml((filter.terms || []).join('\n'))}</textarea>`;
        break;
      case 'value': {
        const values = getDistinctValues(table, filter.columnId);
        body += `
          <label>Colonne</label>${colSelect}
          <label>Valeurs</label>
          <select class="filter-values" multiple size="5">
            ${values.map((v) => `<option value="${App.escapeHtml(v)}" ${(filter.values || []).includes(v) ? 'selected' : ''}>${App.escapeHtml(v)}</option>`).join('')}
          </select>`;
        break;
      }
      case 'date':
        if (editorOptions.monthlyContext) {
          const mode = isMonthlyDateMode(filter.dateMode) ? filter.dateMode : 'pendant_mois';
          const cmp = filter.monthlyDateCompare || 'apres';
          const showCompare = mode === 'debut_mois' || mode === 'fin_mois';
          body += `
          <label>Colonne (date)</label>
          <select class="filter-col filter-date-col" data-stack="${stackId}" data-filter="${filter.id}">
            ${columnOptions(table, filter.columnId, getDateColumns)}
          </select>
          <label>Période (relative au mois de la colonne)</label>
          <select class="filter-date-mode">
            ${MONTHLY_DATE_MODES.map((m) => `<option value="${m.value}" ${mode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          <div class="filter-monthly-compare-row ${showCompare ? '' : 'hidden'}">
            <label>Par rapport au point de référence</label>
            <select class="filter-monthly-date-compare">
              <option value="avant" ${cmp === 'avant' ? 'selected' : ''}>Avant</option>
              <option value="apres" ${cmp === 'apres' ? 'selected' : ''}>Après</option>
            </select>
          </div>
          <p class="filter-hint monthly-date-hint">Le mois de référence est celui de chaque colonne du tableau des valeurs.</p>`;
        } else {
          body += `
          <label>Colonne (date)</label>
          <select class="filter-col filter-date-col" data-stack="${stackId}" data-filter="${filter.id}">
            ${columnOptions(table, filter.columnId, getDateColumns)}
          </select>
          <label>Condition</label>
          <select class="filter-date-mode">
            ${DATE_MODES.map((m) => `<option value="${m.value}" ${filter.dateMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          <div class="date-picks">
            <button type="button" class="btn btn-secondary btn-pick-date" data-field="date1">${filter.dateMode === 'between' ? 'Début' : 'Date'} : ${formatTsLabel(filter.date1)}</button>
            ${filter.dateMode === 'between' ? `<button type="button" class="btn btn-secondary btn-pick-date" data-field="date2">Fin : ${formatTsLabel(filter.date2)}</button>` : ''}
          </div>`;
        }
        break;
      case 'number':
        body += `
          <label>Colonne</label>
          <select class="filter-col" data-stack="${stackId}" data-filter="${filter.id}">
            ${columnOptions(table, filter.columnId, getNumberColumns)}
          </select>
          <label>Condition</label>
          <select class="filter-number-mode">
            ${NUMBER_MODES.map((m) => `<option value="${m.value}" ${filter.numberMode === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
          <label class="num-label-1">${filter.numberMode === 'between' ? 'Min' : 'Valeur'}</label>
          <input type="number" class="filter-num1" value="${filter.num1 ?? 0}" step="any">
          ${filter.numberMode === 'between' ? `<label>Max</label><input type="number" class="filter-num2" value="${filter.num2 ?? 0}" step="any">` : ''}`;
        break;
      case 'empty':
      case 'notEmpty':
        body += `<label>Colonne</label>${colSelect}`;
        break;
    }

    body += '</div>';
    return body;
  }

  function renderResultTable(table, rows, maxRows = 200) {
    if (rows.length === 0) {
      return '<p class="filter-no-rows">Aucune ligne ne correspond à cette pile.</p>';
    }
    const limit = maxRows === Infinity ? rows.length : maxRows;
    const slice = rows.slice(0, limit);
    let html = '<div class="filter-result-wrapper"><table class="filter-result-table"><thead><tr>';
    table.columns.forEach((col) => { html += `<th>${App.escapeHtml(col.name)}</th>`; });
    html += '</tr></thead><tbody>';
    slice.forEach((row) => {
      html += '<tr>';
      table.columns.forEach((col) => {
        html += `<td>${App.escapeHtml(String(App.formatCellValue(row, col) ?? ''))}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (rows.length > limit) {
      html += `<p class="filter-truncated">… ${rows.length - limit} ligne(s) supplémentaire(s) non affichée(s)</p>`;
    }
    return html;
  }

  function renderConnectorSelect(filter) {
    return `
      <div class="filter-connector">
        <select class="filter-connector-select" title="Condition avec le filtre précédent">
          ${FILTER_CONNECTORS.map((c) =>
            `<option value="${c.value}" ${(filter.connector || 'ET') === c.value ? 'selected' : ''} title="${c.title}">${c.label}</option>`
          ).join('')}
        </select>
      </div>`;
  }

  function renderStack(stack, table, options = {}) {
    const showResults = options.showResults !== false;
    const monthlyContext = options.monthlyContext === true;
    const filtered = monthlyContext ? [] : applyStack(table.rows, stack, table);
    const total = table.rows.length;
    const stackCountLabel = monthlyContext
      ? 'Comptage → onglet Valeurs'
      : `${filtered.length} / ${total} ligne(s)`;

    let filtersHtml = '';
    stack.filters.forEach((filter, idx) => {
      const typeLabel = FILTER_TYPES.find((t) => t.value === filter.type)?.label || filter.type;
      if (idx > 0) {
        filtersHtml += renderConnectorSelect(filter);
      }
      filtersHtml += `
        <div class="filter-item" data-filter-id="${filter.id}">
          <div class="filter-item-header">
            <span class="filter-order">#${idx + 1}</span>
            <span class="filter-type-badge">${typeLabel}</span>
            ${idx > 0 ? `<span class="filter-connector-badge">${filter.connector || 'ET'}</span>` : ''}
            <div class="filter-item-actions">
              <button type="button" class="btn-icon btn-filter-up" title="Monter" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn-icon btn-filter-down" title="Descendre" ${idx === stack.filters.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn-icon btn-filter-remove" title="Supprimer">×</button>
            </div>
          </div>
          ${renderFilterEditor(filter, table, stack.id, { monthlyContext })}
        </div>`;
    });

    return `
      <div class="filter-stack" data-stack-id="${stack.id}">
        <div class="filter-stack-header">
          <input type="text" class="stack-name" value="${App.escapeHtml(stack.name)}" title="Nom de la pile">
          <span class="stack-count">${stackCountLabel}</span>
          <button type="button" class="btn-icon btn-stack-remove" title="Supprimer la pile">×</button>
        </div>
        <div class="filter-stack-body">
          <div class="filter-add-row">
            <select class="filter-type-select">
              ${FILTER_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-add-filter">+ Filtre</button>
          </div>
          <div class="filter-list">${filtersHtml || '<p class="filter-hint">Ajoutez des filtres pour créer un compteur.</p>'}</div>
          ${showResults ? `<div class="filter-results">
            <h4>Résultat après filtrage</h4>
            ${renderResultTable(table, filtered)}
          </div>` : `<p class="filter-hint">Les comptages mensuels apparaissent dans l'onglet « Valeur des statistiques ».</p>`}
        </div>
      </div>`;
  }

  function readFilterFromDom(filterEl, filter, table) {
    const colSel = filterEl.querySelector('.filter-col, .filter-date-col');
    if (colSel) filter.columnId = colSel.value;

    switch (filter.type) {
      case 'text':
        filter.matchMode = filterEl.querySelector('.filter-text-mode')?.value || 'contains';
        filter.terms = (filterEl.querySelector('.filter-terms')?.value || '').split('\n').map((s) => s.trim()).filter(Boolean);
        break;
      case 'value': {
        const sel = filterEl.querySelector('.filter-values');
        filter.values = sel ? [...sel.selectedOptions].map((o) => o.value) : [];
        break;
      }
      case 'date':
        filter.dateMode = filterEl.querySelector('.filter-date-mode')?.value || 'after';
        const cmpSel = filterEl.querySelector('.filter-monthly-date-compare');
        if (cmpSel) filter.monthlyDateCompare = cmpSel.value;
        if (isMonthlyDateMode(filter.dateMode)) {
          delete filter.date1;
          delete filter.date2;
        }
        break;
      case 'number':
        filter.numberMode = filterEl.querySelector('.filter-number-mode')?.value || 'gt';
        filter.num1 = parseFloat(filterEl.querySelector('.filter-num1')?.value) || 0;
        filter.num2 = parseFloat(filterEl.querySelector('.filter-num2')?.value) || filter.num1;
        break;
    }
  }

  function syncFiltersFromDom(stackEl, stack, table) {
    stack.filters.forEach((filter, idx) => {
      if (idx > 0) {
        const connectorEl = stackEl.querySelectorAll('.filter-connector')[idx - 1];
        const sel = connectorEl?.querySelector('.filter-connector-select');
        if (sel) filter.connector = sel.value;
      }
      const filterEl = stackEl.querySelector(`.filter-item[data-filter-id="${filter.id}"]`);
      if (filterEl) readFilterFromDom(filterEl, filter, table);
    });
  }

  let activePanel = null;

  const PANELS = {
    current: {
      stacksKey: 'filterStacks',
      showResults: true,
      getContainer: () => els.container,
      getEmpty: () => els.empty,
      getTableName: () => els.tableName,
      getBtnAdd: () => els.btnAddStack,
    },
    monthly: {
      stacksKey: 'monthlyFilterStacks',
      showResults: false,
      monthlyContext: true,
      getContainer: () => document.getElementById('monthly-stacks-container'),
      getEmpty: () => document.getElementById('monthly-empty'),
      getTableName: () => document.getElementById('monthly-table-name'),
      getBtnAdd: () => document.getElementById('btn-add-monthly-stack'),
    },
  };

  function renderPanel(panelKey) {
    activePanel = PANELS[panelKey] || PANELS.current;
    const panel = activePanel;
    const container = panel.getContainer();
    const emptyEl = panel.getEmpty();
    const tableNameEl = panel.getTableName();
    if (!container) return;

    const table = App.getActiveTable();
    if (tableNameEl) tableNameEl.textContent = table ? table.name : '—';

    if (!table || table.rows.length === 0) {
      container.innerHTML = '';
      emptyEl?.classList.remove('hidden');
      return;
    }

    emptyEl?.classList.add('hidden');
    const stacks = ensureStacks(table, panel.stacksKey);

    container.innerHTML = stacks.map((stack) =>
      renderStack(stack, table, { showResults: panel.showResults, monthlyContext: panel.monthlyContext })
    ).join('');
    bindStackEvents(table, panel);
  }

  function render() {
    renderPanel('current');
  }

  function bindStackEvents(table, panel) {
    const container = panel.getContainer();
    const stacks = ensureStacks(table, panel.stacksKey);

    container.querySelectorAll('.filter-stack').forEach((stackEl) => {
      const stackId = stackEl.dataset.stackId;
      const stack = stacks.find((s) => s.id === stackId);
      if (!stack) return;

      stackEl.querySelector('.stack-name')?.addEventListener('change', (e) => {
        stack.name = e.target.value.trim() || stack.name;
        if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
      });

      stackEl.querySelector('.btn-stack-remove')?.addEventListener('click', () => {
        table[panel.stacksKey] = stacks.filter((s) => s.id !== stackId);
        renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
        if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
      });

      stackEl.querySelector('.btn-add-filter')?.addEventListener('click', () => {
        syncFiltersFromDom(stackEl, stack, table);
        const type = stackEl.querySelector('.filter-type-select').value;
        stack.filters.push(defaultFilter(type, table, panel.monthlyContext));
        renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
        if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
      });

      stackEl.querySelectorAll('.filter-connector-select').forEach((sel, idx) => {
        sel.addEventListener('change', () => {
          if (stack.filters[idx + 1]) {
            stack.filters[idx + 1].connector = sel.value;
          }
          renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
          if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
        });
      });

      stackEl.querySelectorAll('.filter-item').forEach((filterEl) => {
        const filterId = filterEl.dataset.filterId;
        const filter = stack.filters.find((f) => f.id === filterId);
        if (!filter) return;

        const rerender = () => {
          readFilterFromDom(filterEl, filter, table);
          renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
          if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
        };

        filterEl.querySelectorAll('select, textarea, input').forEach((input) => {
          input.addEventListener('change', rerender);
          if (input.tagName === 'TEXTAREA' || input.type === 'number') {
            input.addEventListener('input', App.debounce(rerender, 400));
          }
        });

        filterEl.querySelector('.btn-filter-remove')?.addEventListener('click', () => {
          stack.filters = stack.filters.filter((f) => f.id !== filterId);
          renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
          if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
        });

        filterEl.querySelector('.btn-filter-up')?.addEventListener('click', () => {
          syncFiltersFromDom(stackEl, stack, table);
          const i = stack.filters.findIndex((f) => f.id === filterId);
          if (i > 0) {
            [stack.filters[i - 1], stack.filters[i]] = [stack.filters[i], stack.filters[i - 1]];
            renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
            if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
          }
        });

        filterEl.querySelector('.btn-filter-down')?.addEventListener('click', () => {
          syncFiltersFromDom(stackEl, stack, table);
          const i = stack.filters.findIndex((f) => f.id === filterId);
          if (i < stack.filters.length - 1) {
            [stack.filters[i + 1], stack.filters[i]] = [stack.filters[i], stack.filters[i + 1]];
            renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
            if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
          }
        });

        filterEl.querySelectorAll('.btn-pick-date').forEach((btn) => {
          btn.addEventListener('click', () => {
            syncFiltersFromDom(stackEl, stack, table);
            const field = btn.dataset.field;
            openDatetimePicker(filter[field] || Date.now(), (ts) => {
              filter[field] = ts;
              renderPanel(panel === PANELS.monthly ? 'monthly' : 'current');
              if (panel.stacksKey === 'monthlyFilterStacks' && App.Monthly) App.Monthly.renderValues();
            });
          });
        });
      });
    });
  }

  let calendarView = { year: 0, month: 0, selectedDay: null };

  function openDatetimePicker(initialTs, callback) {
    datetimePickerCallback = callback;
    const d = new Date(initialTs || Date.now());
    calendarView = { year: d.getFullYear(), month: d.getMonth(), selectedDay: d.getDate() };
    els.datetimeTime.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    renderCalendar();
    els.datetimeModal.classList.remove('hidden');
  }

  function closeDatetimePicker() {
    els.datetimeModal.classList.add('hidden');
    datetimePickerCallback = null;
  }

  function renderCalendar() {
    const { year, month, selectedDay } = calendarView;
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    els.calendarMonthLabel.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const offset = (firstDay + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    els.calendarGrid.innerHTML = '';
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d) => {
      const h = document.createElement('div');
      h.className = 'cal-head';
      h.textContent = d;
      els.calendarGrid.appendChild(h);
    });

    for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-empty';
      els.calendarGrid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cal-day' + (day === selectedDay ? ' selected' : '');
      cell.textContent = day;
      cell.addEventListener('click', () => {
        calendarView.selectedDay = day;
        renderCalendar();
      });
      els.calendarGrid.appendChild(cell);
    }
  }

  function confirmDatetimePicker() {
    if (!datetimePickerCallback) return;
    const { year, month, selectedDay } = calendarView;
    const day = selectedDay || 1;
    const [hh, mm] = (els.datetimeTime.value || '00:00').split(':').map(Number);
    const ts = new Date(year, month, day, hh || 0, mm || 0, 0).getTime();
    datetimePickerCallback(ts);
    closeDatetimePicker();
  }

  function serializeFilter(f, table) {
    const col = table.columns.find((c) => c.id === f.columnId);
    const { id, ...rest } = f;
    return { ...rest, columnName: col?.name || '' };
  }

  function serializeStack(stack, table) {
    return {
      name: stack.name,
      filters: (stack.filters || []).map((f) => serializeFilter(f, table)),
    };
  }

  function buildColumnMap(table) {
    return table.columns.map((c) => ({
      id: c.id,
      name: c.name,
      sourceKey: c.sourceKey,
      formatter: c.formatter,
    }));
  }

  function exportFiltersJson() {
    const table = App.getActiveTable();
    if (!table) return;
    ensureFilterStacks(table);
    if (App.Monthly?.ensureMonthlyConfig) App.Monthly.ensureMonthlyConfig(table);

    const monthlyStacks = table.monthlyFilterStacks || [];
    const monthDateCol = table.columns.find((c) => c.id === table.monthDateColumnId);

    const payload = {
      version: 2,
      tableName: table.name,
      columns: buildColumnMap(table),
      filterStacks: table.filterStacks.map((s) => serializeStack(s, table)),
      monthlyFilterStacks: monthlyStacks.map((s) => serializeStack(s, table)),
      monthDateColumnId: table.monthDateColumnId || '',
      monthDateColumnName: monthDateCol?.name || '',
      monthlyCalculations: (table.monthlyCalculations || []).map((calc) =>
        App.Monthly.serializeCalculationForExport(table, calc)
      ),
    };

    const json = JSON.stringify(payload, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      alert('Configuration des filtres (courant + mensuel) copiée dans le presse-papiers.');
    }).catch(() => {
      prompt('Copiez ce JSON :', json);
    });
  }

  function resolveColumnId(table, columnId, columnName) {
    if (columnId && table.columns.some((c) => c.id === columnId)) return columnId;
    if (columnName) {
      const byName = table.columns.find((c) => c.name === columnName);
      if (byName) return byName.id;
    }
    return table.columns[0]?.id || '';
  }

  function importStackFilters(stack, table) {
    return {
      id: App.uid(),
      name: stack.name || 'Pile importée',
      filters: (stack.filters || []).map((f) => {
        const filter = { ...f, id: App.uid(), connector: f.connector || 'ET' };
        filter.columnId = resolveColumnId(table, f.columnId, f.columnName);
        delete filter.columnName;
        return filter;
      }),
    };
  }

  function importFilterStacks(table, stacks) {
    table.filterStacks = stacks.map((s) => importStackFilters(s, table));
  }

  function importMonthlyConfig(table, data) {
    if (App.Monthly?.ensureMonthlyConfig) App.Monthly.ensureMonthlyConfig(table);

    if (data.monthlyFilterStacks && Array.isArray(data.monthlyFilterStacks)) {
      table.monthlyFilterStacks = data.monthlyFilterStacks.map((s) => importStackFilters(s, table));
    }

    if (data.monthDateColumnId || data.monthDateColumnName) {
      table.monthDateColumnId = resolveColumnId(
        table,
        data.monthDateColumnId,
        data.monthDateColumnName
      );
    }

    if (data.monthlyCalculations && Array.isArray(data.monthlyCalculations)) {
      const stackNameToId = {};
      (table.monthlyFilterStacks || []).forEach((s) => { stackNameToId[s.name] = s.id; });

      const imported = data.monthlyCalculations.map((calc) => ({
        id: App.uid(),
        name: calc.name || 'Calcul',
        op: calc.op || 'add',
        rawOperands: calc.operands || (calc.stackNames || []).map((n) => ({ type: 'stack', name: n })),
      }));

      const calcNameToId = {};
      imported.forEach((c) => { calcNameToId[c.name] = c.id; });

      table.monthlyCalculations = imported.map((c) => {
        const operands = (c.rawOperands || []).map((op) => {
          if (op.type === 'calc') {
            const id = calcNameToId[op.name];
            return id ? { type: 'calc', id } : null;
          }
          const id = stackNameToId[op.name];
          return id ? { type: 'stack', id } : null;
        }).filter(Boolean);
        return { id: c.id, name: c.name, op: c.op, operands };
      });
    }
  }

  function refreshAfterFilterImport() {
    render();
    if (App.Monthly) {
      App.Monthly.renderStacks();
      App.Monthly.renderValues();
    }
    if (App.Charts) App.Charts.render();
  }

  function importFiltersJson(jsonStr) {
    const table = App.getActiveTable();
    if (!table) return;
    try {
      const data = JSON.parse(jsonStr);

      if (data.version >= 2) {
        if (data.filterStacks && Array.isArray(data.filterStacks)) {
          importFilterStacks(table, data.filterStacks);
        }
        importMonthlyConfig(table, data);
      } else if (data.stacks && Array.isArray(data.stacks)) {
        importFilterStacks(table, data.stacks);
      } else {
        throw new Error('Format invalide');
      }

      refreshAfterFilterImport();
      els.filterImportModal.classList.add('hidden');
    } catch (err) {
      alert('Erreur d\'import : ' + err.message);
    }
  }

  function openFilterImportModal() {
    els.filterImportText.value = '';
    els.filterImportModal.classList.remove('hidden');
  }

  function bindGlobalEvents() {
    els.btnAddStack?.addEventListener('click', () => {
      const table = App.getActiveTable();
      if (!table) return;
      ensureFilterStacks(table).push(defaultStack());
      render();
    });

    els.btnExport?.addEventListener('click', exportFiltersJson);
    els.btnImport?.addEventListener('click', openFilterImportModal);
    els.btnExportMonthly?.addEventListener('click', exportFiltersJson);
    els.btnImportMonthly?.addEventListener('click', openFilterImportModal);

    els.calendarPrev?.addEventListener('click', () => {
      calendarView.month--;
      if (calendarView.month < 0) { calendarView.month = 11; calendarView.year--; }
      renderCalendar();
    });
    els.calendarNext?.addEventListener('click', () => {
      calendarView.month++;
      if (calendarView.month > 11) { calendarView.month = 0; calendarView.year++; }
      renderCalendar();
    });

    els.datetimeConfirm?.addEventListener('click', confirmDatetimePicker);
    els.datetimeCancel?.addEventListener('click', closeDatetimePicker);
    els.datetimeModalClose?.addEventListener('click', closeDatetimePicker);
    els.datetimeModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDatetimePicker);

    els.filterImportConfirm?.addEventListener('click', () => {
      importFiltersJson(els.filterImportText.value);
    });
    els.filterImportCancel?.addEventListener('click', () => els.filterImportModal.classList.add('hidden'));
    els.filterImportModalClose?.addEventListener('click', () => els.filterImportModal.classList.add('hidden'));
    els.filterImportModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => els.filterImportModal.classList.add('hidden'));
  }

  App.Stats = {
    init() {
      initEls();
      bindGlobalEvents();
    },
    render,
    renderPanel,
    renderResultTable,
    applyStack,
    defaultStack,
    openDatetimePicker,
    exportFiltersJson,
    importFiltersJson,
    resolveColumnId,
    buildColumnMap,
  };

  App.FilterEngine = {
    applyStack,
    rowMatchesFilter,
    getCellRawForFilter,
    getCellDisplay,
    isMonthlyDateMode,
    getMonthBounds,
    matchMonthlyDateFilter,
  };

  if (window.AppCore) {
    App.Stats.init();
  }
})(window.AppCore);
