(function () {
  'use strict';

  const DATE_DISPLAY_FORMATS = {
    'DD/MM/YYYY': (ts) => formatTimestamp(ts, 'date'),
    'DD/MM/YYYY HH:mm': (ts) => formatTimestamp(ts, 'datetime'),
    'YYYY-MM-DD': (ts) => formatTimestamp(ts, 'iso-date'),
    'timestamp': (ts) => String(ts),
  };

  const state = {
    tables: [],
    activeTableId: null,
    activeView: 'table',
    pendingImport: null,
  };

  const els = {
    fileInput: document.getElementById('file-input'),
    tabBar: document.getElementById('tab-bar'),
    tableHead: document.getElementById('table-head'),
    tableBody: document.getElementById('table-body'),
    tableInfo: document.getElementById('table-info'),
    emptyState: document.getElementById('empty-state'),
    dataTable: document.getElementById('data-table'),
    btnColumnSettings: document.getElementById('btn-column-settings'),
    btnExportPdf: document.getElementById('btn-export-pdf'),
    viewTable: document.getElementById('view-table'),
    viewStats: document.getElementById('view-stats'),
    viewInfo: document.getElementById('view-info'),
    viewMonthly: document.getElementById('view-monthly'),
    viewValues: document.getElementById('view-values'),
    viewCharts: document.getElementById('view-charts'),
    statsTableName: document.getElementById('stats-table-name'),
    importModal: document.getElementById('import-modal'),
    importFilename: document.getElementById('import-filename'),
    importMode: document.getElementById('import-mode'),
    targetTableGroup: document.getElementById('target-table-group'),
    targetTable: document.getElementById('target-table'),
    idColumnGroup: document.getElementById('id-column-group'),
    idColumn: document.getElementById('id-column'),
    headerRow: document.getElementById('header-row'),
    previewHead: document.getElementById('preview-head'),
    previewBody: document.getElementById('preview-body'),
    columnsConfig: document.getElementById('columns-config'),
    importWarnings: document.getElementById('import-warnings'),
    importConfirm: document.getElementById('import-confirm'),
    importCancel: document.getElementById('import-cancel'),
    importModalClose: document.getElementById('import-modal-close'),
    columnModal: document.getElementById('column-modal'),
    columnSettingsList: document.getElementById('column-settings-list'),
    columnSettingsSave: document.getElementById('column-settings-save'),
    columnSettingsCancel: document.getElementById('column-settings-cancel'),
    columnModalClose: document.getElementById('column-modal-close'),
  };

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function getActiveTable() {
    return state.tables.find((t) => t.id === state.activeTableId) || null;
  }

  function formatTimestamp(ts, mode) {
    if (ts == null || isNaN(ts)) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = pad(d.getHours());
    const mins = pad(d.getMinutes());
    if (mode === 'date') return `${day}/${month}/${year}`;
    if (mode === 'datetime') return `${day}/${month}/${year} ${hours}:${mins}`;
    if (mode === 'iso-date') return `${year}-${month}-${day}`;
    return `${day}/${month}/${year} ${hours}:${mins}`;
  }

  function parseDateWithFormat(str, format) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();
    const tokens = format.match(/DD|MM|YYYY|HH|mm|ss/g) || [];
    let regex = format;
    const groups = [];
    tokens.forEach((tok) => {
      if (tok === 'DD') { regex = regex.replace('DD', '(\\d{2})'); groups.push('day'); }
      else if (tok === 'MM') { regex = regex.replace('MM', '(\\d{2})'); groups.push('month'); }
      else if (tok === 'YYYY') { regex = regex.replace('YYYY', '(\\d{4})'); groups.push('year'); }
      else if (tok === 'HH') { regex = regex.replace('HH', '(\\d{2})'); groups.push('hours'); }
      else if (tok === 'mm') { regex = regex.replace('mm', '(\\d{2})'); groups.push('minutes'); }
      else if (tok === 'ss') { regex = regex.replace('ss', '(\\d{2})'); groups.push('seconds'); }
    });
    regex = '^' + regex.replace(/[/.:\s]/g, (m) => '\\' + m) + '$';
    const match = trimmed.match(new RegExp(regex));
    if (!match) return null;
    const parts = {};
    groups.forEach((g, i) => { parts[g] = parseInt(match[i + 1], 10); });
    const date = new Date(
      parts.year,
      (parts.month || 1) - 1,
      parts.day || 1,
      parts.hours || 0,
      parts.minutes || 0,
      parts.seconds || 0
    );
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  function applyFormatter(raw, formatter) {
    if (raw == null || raw === '') return { value: '', warning: null };
    const str = String(raw);

    switch (formatter.type) {
      case 'date': {
        const ts = parseDateWithFormat(str, formatter.inputFormat || 'DD/MM/YYYY HH:mm');
        if (ts == null) return { value: str, warning: `Date non convertie : "${str}"` };
        const displayFn = DATE_DISPLAY_FORMATS[formatter.displayFormat] || DATE_DISPLAY_FORMATS['DD/MM/YYYY HH:mm'];
        return { value: displayFn(ts), rawTs: ts, warning: null };
      }
      case 'number': {
        const normalized = str.replace(/\s/g, '').replace(',', '.');
        const num = parseFloat(normalized);
        if (isNaN(num)) return { value: str, warning: `Nombre non converti : "${str}"` };
        return { value: num, warning: null };
      }
      case 'uppercase':
        return { value: str.toUpperCase(), warning: null };
      default:
        return { value: str, warning: null };
    }
  }

  function formatCellValue(row, col) {
    const raw = row.data[col.id];
    if (col.formatter?.type === 'date') {
      const ts = typeof raw === 'number' ? raw : parseDateWithFormat(String(raw), col.formatter.inputFormat || 'DD/MM/YYYY HH:mm');
      if (ts != null) {
        const displayFn = DATE_DISPLAY_FORMATS[col.formatter.displayFormat] || DATE_DISPLAY_FORMATS['DD/MM/YYYY HH:mm'];
        return displayFn(ts);
      }
    }
    if (col.formatter && col.formatter.type !== 'none') {
      return applyFormatter(raw, col.formatter).value;
    }
    return raw ?? '';
  }

  function parseXlsxFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
          resolve({ rows, sheetName, fileName: file.name });
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function getHeadersFromRows(rows, headerRowIndex) {
    const headerRow = rows[headerRowIndex] || [];
    return headerRow.map((h, i) => {
      const label = String(h || '').trim() || `Colonne ${i + 1}`;
      return { index: i, label };
    });
  }

  function getDataRows(rows, headerRowIndex) {
    return rows.slice(headerRowIndex + 1).filter((row) =>
      row.some((cell) => cell !== '' && cell != null)
    );
  }

  function renderTabs() {
    els.tabBar.innerHTML = '';
    state.tables.forEach((table) => {
      const tab = document.createElement('div');
      tab.className = 'tab' + (table.id === state.activeTableId ? ' active' : '');
      tab.dataset.id = table.id;

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'tab-name';
      nameInput.value = table.name;
      nameInput.title = 'Double-clic pour renommer';
      nameInput.addEventListener('click', (e) => e.stopPropagation());
      nameInput.addEventListener('change', () => {
        table.name = nameInput.value.trim() || table.name;
        nameInput.value = table.name;
        renderActiveView();
      });

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'Fermer le tableau';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTable(table.id);
      });

      tab.appendChild(nameInput);
      if (state.tables.length > 1) tab.appendChild(closeBtn);

      tab.addEventListener('click', () => {
        state.activeTableId = table.id;
        renderTabs();
        renderTable();
        renderActiveView();
        updateToolbar();
      });

      els.tabBar.appendChild(tab);
    });
  }

  function deleteTable(id) {
    const idx = state.tables.findIndex((t) => t.id === id);
    if (idx === -1) return;
    state.tables.splice(idx, 1);
    if (state.activeTableId === id) {
      state.activeTableId = state.tables[0]?.id || null;
    }
    renderTabs();
    renderTable();
    updateToolbar();
    renderActiveView();
  }

  function renderTable() {
    const table = getActiveTable();
    if (!table) {
      els.dataTable.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.tableInfo.textContent = '';
      return;
    }

    els.dataTable.style.display = 'table';
    els.emptyState.style.display = 'none';
    els.tableInfo.textContent = `${table.rows.length} ligne(s) · ${table.columns.length} colonne(s)`;

    els.tableHead.innerHTML = '';
    const headRow = document.createElement('tr');
    table.columns.forEach((col) => {
      const th = document.createElement('th');
      th.textContent = col.name;
      headRow.appendChild(th);
    });
    els.tableHead.appendChild(headRow);

    els.tableBody.innerHTML = '';
    table.rows.forEach((row) => {
      const tr = document.createElement('tr');
      table.columns.forEach((col) => {
        const td = document.createElement('td');
        td.textContent = formatCellValue(row, col);
        tr.appendChild(td);
      });
      els.tableBody.appendChild(tr);
    });
  }

  function renderActiveView() {
    switch (state.activeView) {
      case 'stats':
        renderStatsView();
        break;
      case 'info':
        window.AppCore?.Info?.render();
        break;
      case 'monthly':
        window.AppCore?.Monthly?.renderStacks();
        break;
      case 'values':
        window.AppCore?.Monthly?.renderValues();
        break;
      case 'charts':
        window.AppCore?.Charts?.render();
        break;
    }
  }

  function renderStatsView() {
    const table = getActiveTable();
    els.statsTableName.textContent = table ? table.name : '—';
    if (window.AppCore?.Stats) {
      AppCore.Stats.render();
    }
  }

  function updateToolbar() {
    const hasTable = !!getActiveTable();
    els.btnColumnSettings.disabled = !hasTable;
    if (els.btnExportPdf) els.btnExportPdf.disabled = !hasTable;
  }

  function openImportModal(pending) {
    state.pendingImport = pending;
    const { rows, fileName } = pending;
    els.importFilename.textContent = fileName;

    els.headerRow.innerHTML = '';
    const maxPreview = Math.min(rows.length, 15);
    for (let i = 0; i < maxPreview; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `Ligne ${i + 1}`;
      els.headerRow.appendChild(opt);
    }

    updateTargetTableSelect();
    updateImportModeUI();
    renderPreview();
    renderColumnsConfig();

    els.importWarnings.classList.add('hidden');
    els.importWarnings.innerHTML = '';
    els.importModal.classList.remove('hidden');
  }

  function closeImportModal() {
    state.pendingImport = null;
    els.importModal.classList.add('hidden');
  }

  function updateTargetTableSelect() {
    els.targetTable.innerHTML = '';
    state.tables.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      els.targetTable.appendChild(opt);
    });
  }

  function updateImportModeUI() {
    const mode = els.importMode.value;
    const hasTables = state.tables.length > 0;
    els.targetTableGroup.classList.toggle('hidden', mode === 'new');
    els.idColumnGroup.classList.toggle('hidden', mode !== 'merge');

    els.importMode.querySelectorAll('option').forEach((opt) => {
      if (opt.value === 'append' || opt.value === 'merge') {
        opt.disabled = !hasTables;
      }
    });
    if ((mode === 'append' || mode === 'merge') && !hasTables) {
      els.importMode.value = 'new';
    }

    renderColumnsConfig();
    updateIdColumnSelect();
  }

  function updateIdColumnSelect() {
    els.idColumn.innerHTML = '';
    const headers = getCurrentImportHeaders();
    headers.forEach((h) => {
      const opt = document.createElement('option');
      opt.value = h.index;
      opt.textContent = h.label;
      els.idColumn.appendChild(opt);
    });
  }

  function getCurrentImportHeaders() {
    if (!state.pendingImport) return [];
    const headerIdx = parseInt(els.headerRow.value, 10) || 0;
    return getHeadersFromRows(state.pendingImport.rows, headerIdx);
  }

  function renderPreview() {
    if (!state.pendingImport) return;
    const { rows } = state.pendingImport;
    const headerIdx = parseInt(els.headerRow.value, 10) || 0;
    const previewRows = rows.slice(0, 12);
    const maxCols = Math.max(...previewRows.map((r) => r.length), 1);

    els.previewHead.innerHTML = '';
    els.previewBody.innerHTML = '';

    const headTr = document.createElement('tr');
    const numTh = document.createElement('th');
    numTh.textContent = '#';
    headTr.appendChild(numTh);
    for (let ci = 0; ci < maxCols; ci++) {
      const th = document.createElement('th');
      th.textContent = String.fromCharCode(65 + (ci % 26));
      headTr.appendChild(th);
    }
    els.previewHead.appendChild(headTr);

    previewRows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      if (ri === headerIdx) tr.classList.add('header-selected');
      const numTd = document.createElement('td');
      numTd.textContent = ri + 1;
      tr.appendChild(numTd);
      for (let ci = 0; ci < maxCols; ci++) {
        const td = document.createElement('td');
        td.textContent = row[ci] ?? '';
        tr.appendChild(td);
      }
      els.previewBody.appendChild(tr);
    });
  }

  function createFormatterOptionsHTML(colIndex, formatter, isNewTable, targetColumns, mappedColId) {
    const type = formatter?.type || 'none';
    let html = `<div class="formatter-options ${isNewTable ? '' : 'hidden'}" data-col="${colIndex}">`;

    if (!isNewTable) {
      html += `<div class="formatter-row">
        <label>Lier à la colonne :</label>
        <select class="map-target" data-col="${colIndex}">
          <option value="">— Nouvelle colonne —</option>`;
      targetColumns.forEach((c) => {
        html += `<option value="${c.id}" ${mappedColId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`;
      });
      html += `</select></div>`;
    }

    html += `<div class="formatter-row">
      <label>Formateur :</label>
      <select class="formatter-type" data-col="${colIndex}">
        <option value="none" ${type === 'none' ? 'selected' : ''}>Aucun</option>
        <option value="date" ${type === 'date' ? 'selected' : ''}>Date</option>
        <option value="number" ${type === 'number' ? 'selected' : ''}>Nombre</option>
        <option value="uppercase" ${type === 'uppercase' ? 'selected' : ''}>Majuscules</option>
      </select>
    </div>`;

    html += `<div class="formatter-row date-options ${type === 'date' ? '' : 'hidden'}" data-col="${colIndex}">
      <label>Format source :</label>
      <input type="text" class="date-input-format" value="${escapeHtml(formatter?.inputFormat || 'DD/MM/YYYY HH:mm')}" placeholder="DD/MM/YYYY HH:mm">
      <label>Affichage :</label>
      <select class="date-display-format">
        ${Object.keys(DATE_DISPLAY_FORMATS).map((f) =>
          `<option value="${f}" ${(formatter?.displayFormat || 'DD/MM/YYYY HH:mm') === f ? 'selected' : ''}>${f}</option>`
        ).join('')}
      </select>
    </div>`;

    html += '</div>';
    return html;
  }

  function toggleDateFormatterFields(container, showDate) {
    container.querySelector('.date-options')?.classList.toggle('hidden', !showDate);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function setAllImportColumnsChecked(checked) {
    els.columnsConfig.querySelectorAll('.column-config').forEach((div) => {
      const checkbox = div.querySelector('.col-checkbox');
      const options = div.querySelector('.formatter-options');
      if (!checkbox) return;
      checkbox.checked = checked;
      div.classList.toggle('disabled', !checked);
      if (checked) options?.classList.remove('hidden');
      else options?.classList.add('hidden');
    });
  }

  function renderColumnsConfig() {
    if (!state.pendingImport) return;
    const headers = getCurrentImportHeaders();
    const mode = els.importMode.value;
    const isNewTable = mode === 'new';
    const targetTable = mode !== 'new' ? state.tables.find((t) => t.id === els.targetTable.value) : null;
    const targetColumns = targetTable?.columns || [];

    els.columnsConfig.innerHTML = '';
    headers.forEach((h) => {
      const div = document.createElement('div');
      div.className = 'column-config';
      div.dataset.index = h.index;

      const checkboxId = `col-check-${h.index}`;
      div.innerHTML = `
        <label class="checkbox-label">
          <input type="checkbox" id="${checkboxId}" class="col-checkbox" data-index="${h.index}" checked>
          <span>${escapeHtml(h.label)}</span>
        </label>
        ${createFormatterOptionsHTML(h.index, { type: 'none' }, isNewTable, targetColumns, '')}
      `;

      const checkbox = div.querySelector('.col-checkbox');
      const options = div.querySelector('.formatter-options');

      checkbox.addEventListener('change', () => {
        div.classList.toggle('disabled', !checkbox.checked);
        options.classList.toggle('hidden', !checkbox.checked || (mode !== 'new' && !isNewTable));
      });

      div.querySelector('.formatter-type')?.addEventListener('change', (e) => {
        toggleDateFormatterFields(div, e.target.value === 'date');
      });

      if (mode !== 'new') {
        options.classList.remove('hidden');
      }

      els.columnsConfig.appendChild(div);
    });

    updateIdColumnSelect();
  }

  function collectColumnConfigFromModal() {
    const configs = [];
    els.columnsConfig.querySelectorAll('.column-config').forEach((div) => {
      const index = parseInt(div.dataset.index, 10);
      const checkbox = div.querySelector('.col-checkbox');
      if (!checkbox.checked) return;

      const formatterType = div.querySelector('.formatter-type')?.value || 'none';
      const formatter = { type: formatterType };

      if (formatterType === 'date') {
        formatter.inputFormat = div.querySelector('.date-input-format')?.value || 'DD/MM/YYYY HH:mm';
        formatter.displayFormat = div.querySelector('.date-display-format')?.value || 'DD/MM/YYYY HH:mm';
      }

      const mapTarget = div.querySelector('.map-target')?.value || '';

      configs.push({
        sourceIndex: index,
        sourceLabel: div.querySelector('.checkbox-label span')?.textContent || '',
        formatter,
        mapToColumnId: mapTarget || null,
      });
    });
    return configs;
  }

  function processImportRows(dataRows, columnConfigs, warnings) {
    return dataRows.map((row) => {
      const rowData = {};
      columnConfigs.forEach((cfg) => {
        const raw = row[cfg.sourceIndex];
        if (cfg.formatter.type !== 'none') {
          const result = applyFormatter(raw, cfg.formatter);
          if (result.warning) warnings.push(result.warning);
          rowData[cfg.tempColId] = result.rawTs != null ? result.rawTs : result.value;
        } else {
          rowData[cfg.tempColId] = raw ?? '';
        }
      });
      return rowData;
    });
  }

  function executeImport() {
    if (!state.pendingImport) return;

    const { rows, fileName } = state.pendingImport;
    const mode = els.importMode.value;
    const headerIdx = parseInt(els.headerRow.value, 10) || 0;
    const headers = getHeadersFromRows(rows, headerIdx);
    const dataRows = getDataRows(rows, headerIdx);
    const columnConfigs = collectColumnConfigFromModal();

    if (columnConfigs.length === 0) {
      alert('Sélectionnez au moins une colonne.');
      return;
    }

    const warnings = [];
    let report = null;

    columnConfigs.forEach((cfg) => {
      cfg.tempColId = uid();
    });

    const processedRows = processImportRows(dataRows, columnConfigs, warnings);

    if (mode === 'new') {
      const table = {
        id: uid(),
        name: fileName.replace(/\.(xlsx|xls)$/i, '') || 'Nouveau tableau',
        sourceFileName: fileName,
        columns: columnConfigs.map((cfg) => ({
          id: cfg.tempColId,
          name: cfg.sourceLabel,
          sourceKey: cfg.sourceLabel,
          formatter: { ...cfg.formatter },
        })),
        rows: processedRows.map((data) => ({ id: uid(), data })),
        filterStacks: [],
        monthlyFilterStacks: [],
        monthlyCalculations: [],
        monthDateColumnId: '',
      };
      state.tables.push(table);
      state.activeTableId = table.id;
      report = { imported: processedRows.length, replaced: 0 };
    } else {
      const target = state.tables.find((t) => t.id === els.targetTable.value);
      if (!target) {
        alert('Sélectionnez un tableau cible.');
        return;
      }

      columnConfigs.forEach((cfg) => {
        if (cfg.mapToColumnId) {
          cfg.tempColId = cfg.mapToColumnId;
          const existingCol = target.columns.find((c) => c.id === cfg.mapToColumnId);
          if (existingCol && cfg.formatter.type !== 'none') {
            existingCol.formatter = { ...cfg.formatter };
          }
        } else {
          target.columns.push({
            id: cfg.tempColId,
            name: cfg.sourceLabel,
            sourceKey: cfg.sourceLabel,
            formatter: { ...cfg.formatter },
          });
        }
      });

      if (mode === 'append') {
        processedRows.forEach((data) => {
          target.rows.push({ id: uid(), data });
        });
        report = { imported: processedRows.length, replaced: 0 };
      } else if (mode === 'merge') {
        const idColIndex = parseInt(els.idColumn.value, 10);
        const idConfig = columnConfigs.find((c) => c.sourceIndex === idColIndex);
        if (!idConfig) {
          alert('La colonne ID doit être sélectionnée dans les colonnes à importer.');
          return;
        }
        const idColId = idConfig.tempColId;

        let imported = 0;
        let replaced = 0;

        processedRows.forEach((data) => {
          const rowId = String(data[idColId] ?? '');
          const existing = target.rows.find((r) => String(r.data[idColId] ?? '') === rowId);
          if (existing && rowId !== '') {
            Object.assign(existing.data, data);
            replaced++;
          } else {
            target.rows.push({ id: uid(), data });
            imported++;
          }
        });

        report = { imported, replaced };
      }

      state.activeTableId = target.id;
    }

    if (warnings.length > 0) {
      els.importWarnings.classList.remove('hidden');
      els.importWarnings.innerHTML = '<strong>Avertissements :</strong><ul>' +
        [...new Set(warnings)].slice(0, 20).map((w) => `<li>${escapeHtml(w)}</li>`).join('') +
        (warnings.length > 20 ? `<li>… et ${warnings.length - 20} autres</li>` : '') +
        '</ul>';
    }

    if (report) {
      const reportEl = document.createElement('div');
      reportEl.className = 'import-report';
      reportEl.textContent = `Import terminé : ${report.imported} ligne(s) ajoutée(s)${report.replaced ? `, ${report.replaced} ligne(s) remplacée(s) (ID)` : ''}.`;
      els.importWarnings.classList.remove('hidden');
      els.importWarnings.appendChild(reportEl);

      setTimeout(() => {
        closeImportModal();
        renderTabs();
        renderTable();
        updateToolbar();
        renderActiveView();
      }, report.replaced || warnings.length ? 2000 : 300);
    } else {
      renderTabs();
      renderTable();
      updateToolbar();
      renderActiveView();
      closeImportModal();
    }
  }

  function openColumnSettingsModal() {
    const table = getActiveTable();
    if (!table) return;

    els.columnSettingsList.innerHTML = '';
    table.columns.forEach((col) => {
      const item = document.createElement('div');
      item.className = 'column-setting-item';
      item.dataset.colId = col.id;

      item.innerHTML = `
        <h4>${escapeHtml(col.name)}</h4>
        <div class="form-group">
          <label>Nom de la colonne</label>
          <input type="text" class="col-name-input" value="${escapeHtml(col.name)}">
        </div>
        ${createFormatterOptionsHTML(0, col.formatter, true, [], '').replace('data-col="0"', `data-col-id="${col.id}"`)}
      `;

      item.querySelector('.formatter-type')?.addEventListener('change', (e) => {
        toggleDateFormatterFields(item, e.target.value === 'date');
      });

      els.columnSettingsList.appendChild(item);
    });

    els.columnModal.classList.remove('hidden');
  }

  function saveColumnSettings() {
    const table = getActiveTable();
    if (!table) return;

    const warnings = [];

    els.columnSettingsList.querySelectorAll('.column-setting-item').forEach((item) => {
      const colId = item.dataset.colId;
      const col = table.columns.find((c) => c.id === colId);
      if (!col) return;

      col.name = item.querySelector('.col-name-input')?.value.trim() || col.name;
      const formatterType = item.querySelector('.formatter-type')?.value || 'none';
      col.formatter = { type: formatterType };

      if (formatterType === 'date') {
        col.formatter.inputFormat = item.querySelector('.date-input-format')?.value || 'DD/MM/YYYY HH:mm';
        col.formatter.displayFormat = item.querySelector('.date-display-format')?.value || 'DD/MM/YYYY HH:mm';
      }

      table.rows.forEach((row) => {
        const raw = row.data[col.id];
        if (formatterType !== 'none' && raw != null && raw !== '') {
          const result = applyFormatter(raw, col.formatter);
          if (result.warning) warnings.push(result.warning);
        }
      });
    });

    els.columnModal.classList.add('hidden');
    renderTable();

    if (warnings.length > 0) {
      alert('Avertissements lors du reformatage :\n' + [...new Set(warnings)].slice(0, 10).join('\n'));
    }
  }

  function switchView(view) {
    state.activeView = view;
    document.querySelectorAll('.view-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    els.viewTable.classList.toggle('active', view === 'table');
    els.viewStats.classList.toggle('active', view === 'stats');
    els.viewInfo.classList.toggle('active', view === 'info');
    els.viewMonthly.classList.toggle('active', view === 'monthly');
    els.viewValues.classList.toggle('active', view === 'values');
    els.viewCharts.classList.toggle('active', view === 'charts');
    renderActiveView();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  window.AppCore = {
    getActiveTable,
    formatCellValue,
    parseDateWithFormat,
    uid,
    escapeHtml,
    debounce,
  };

  els.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const parsed = await parseXlsxFile(file);
      openImportModal(parsed);
    } catch (err) {
      alert('Erreur lors de la lecture du fichier : ' + err.message);
    }
    e.target.value = '';
  });

  els.importMode.addEventListener('change', updateImportModeUI);
  els.targetTable.addEventListener('change', () => {
    renderColumnsConfig();
  });
  els.headerRow.addEventListener('change', () => {
    renderPreview();
    renderColumnsConfig();
  });

  els.importConfirm.addEventListener('click', executeImport);
  els.importCancel.addEventListener('click', closeImportModal);
  document.getElementById('import-cols-select-all')?.addEventListener('click', () => setAllImportColumnsChecked(true));
  document.getElementById('import-cols-deselect-all')?.addEventListener('click', () => setAllImportColumnsChecked(false));
  els.importModalClose.addEventListener('click', closeImportModal);
  els.importModal.querySelector('.modal-backdrop').addEventListener('click', closeImportModal);

  els.btnColumnSettings.addEventListener('click', openColumnSettingsModal);
  els.columnSettingsSave.addEventListener('click', saveColumnSettings);
  els.columnSettingsCancel.addEventListener('click', () => els.columnModal.classList.add('hidden'));
  els.columnModalClose.addEventListener('click', () => els.columnModal.classList.add('hidden'));
  els.columnModal.querySelector('.modal-backdrop').addEventListener('click', () => els.columnModal.classList.add('hidden'));

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  renderTabs();
  renderTable();
  updateToolbar();
})();
