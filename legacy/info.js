(function (App) {
  'use strict';
  if (!App) return;

  const els = {};

  function initEls() {
    els.container = document.getElementById('info-content');
    els.empty = document.getElementById('info-empty');
    els.tableName = document.getElementById('info-table-name');
  }

  function getDateTs(row, col) {
    const raw = row.data[col.id];
    if (typeof raw === 'number') return raw;
    return App.parseDateWithFormat(String(raw), col.formatter?.inputFormat || 'DD/MM/YYYY HH:mm');
  }

  function formatTs(ts) {
    if (!ts || isNaN(ts)) return '—';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function collectInfo(table) {
    const info = {
      name: table.name,
      sourceFile: table.sourceFileName || '—',
      rowCount: table.rows.length,
      colCount: table.columns.length,
      dateColumns: [],
      numberStats: [],
      columnTypes: [],
    };

    table.columns.forEach((col) => {
      const type = col.formatter?.type || 'texte';
      info.columnTypes.push({ name: col.name, type });

      if (col.formatter?.type === 'date') {
        let min = null;
        let max = null;
        let valid = 0;
        table.rows.forEach((row) => {
          const ts = getDateTs(row, col);
          if (ts != null && !isNaN(ts)) {
            valid++;
            if (min == null || ts < min) min = ts;
            if (max == null || ts > max) max = ts;
          }
        });
        info.dateColumns.push({
          name: col.name,
          min: min != null ? formatTs(min) : '—',
          max: max != null ? formatTs(max) : '—',
          valid,
        });
      }

      if (col.formatter?.type === 'number') {
        let min = null;
        let max = null;
        let valid = 0;
        table.rows.forEach((row) => {
          const v = parseFloat(String(row.data[col.id]).replace(',', '.'));
          if (!isNaN(v)) {
            valid++;
            if (min == null || v < min) min = v;
            if (max == null || v > max) max = v;
          }
        });
        info.numberStats.push({
          name: col.name,
          min: min != null ? min : '—',
          max: max != null ? max : '—',
          valid,
        });
      }
    });

    let emptyCells = 0;
    table.rows.forEach((row) => {
      table.columns.forEach((col) => {
        const v = row.data[col.id];
        if (v == null || v === '') emptyCells++;
      });
    });
    info.emptyCells = emptyCells;
    info.totalCells = table.rows.length * table.columns.length;

    return info;
  }

  function render() {
    const table = App.getActiveTable();
    els.tableName.textContent = table ? table.name : '—';

    if (!table || table.rows.length === 0) {
      els.container.innerHTML = '';
      els.empty.classList.remove('hidden');
      return;
    }

    els.empty.classList.add('hidden');
    const info = collectInfo(table);

    els.container.innerHTML = `
      <div class="info-grid">
        <div class="info-card">
          <h3>Général</h3>
          <dl>
            <dt>Nom du tableau</dt><dd>${App.escapeHtml(info.name)}</dd>
            <dt>Fichier source</dt><dd>${App.escapeHtml(info.sourceFile)}</dd>
            <dt>Lignes</dt><dd>${info.rowCount}</dd>
            <dt>Colonnes</dt><dd>${info.colCount}</dd>
            <dt>Cellules vides</dt><dd>${info.emptyCells} / ${info.totalCells}</dd>
          </dl>
        </div>
        <div class="info-card">
          <h3>Colonnes</h3>
          <ul class="info-col-list">
            ${info.columnTypes.map((c) =>
              `<li><strong>${App.escapeHtml(c.name)}</strong> <span class="info-type">${c.type}</span></li>`
            ).join('')}
          </ul>
        </div>
        ${info.dateColumns.length ? `
        <div class="info-card">
          <h3>Dates</h3>
          ${info.dateColumns.map((d) => `
            <dl class="info-sub">
              <dt>${App.escapeHtml(d.name)}</dt>
              <dd>Plus ancienne : ${d.min}</dd>
              <dd>Plus récente : ${d.max}</dd>
              <dd>Valeurs valides : ${d.valid}</dd>
            </dl>
          `).join('')}
        </div>` : ''}
        ${info.numberStats.length ? `
        <div class="info-card">
          <h3>Nombres</h3>
          ${info.numberStats.map((n) => `
            <dl class="info-sub">
              <dt>${App.escapeHtml(n.name)}</dt>
              <dd>Min : ${n.min}</dd>
              <dd>Max : ${n.max}</dd>
              <dd>Valeurs valides : ${n.valid}</dd>
            </dl>
          `).join('')}
        </div>` : ''}
      </div>`;
  }

  App.Info = { init: initEls, render };
  if (window.AppCore) App.Info.init();
})(window.AppCore);
