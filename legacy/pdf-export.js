(function (App) {
  'use strict';
  if (!App) return;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function periodLabel(state) {
    if (state.periodMode === 'year') return `Année ${state.year}`;
    if (state.periodMode === 'month') return App.Monthly.formatMonthLabel(state.month);
    return 'Totalité des dates';
  }

  function buildMatrixHtml(matrix) {
    if (!matrix.series.length) return '<p>Aucune ligne sélectionnée pour le rapport.</p>';
    let html = '<table class="report-table"><thead><tr><th>Pile / Calcul</th>';
    matrix.monthLabels.forEach((label) => {
      html += `<th>${escapeHtml(label)}</th>`;
    });
    html += '</tr></thead><tbody>';
    matrix.series.forEach((series) => {
      const suffix = series.isCalculation ? ' ƒ' : '';
      html += `<tr><td>${escapeHtml(series.name)}${suffix}</td>`;
      series.values.forEach((v) => {
        html += `<td>${escapeHtml(String(v))}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function exportPdfReport() {
    const table = App.getActiveTable();
    if (!table || !table.rows.length) {
      alert('Aucun tableau à exporter.');
      return;
    }

    if (App.Charts?.render) App.Charts.render();
    else if (App.Charts?.drawChart) App.Charts.drawChart();

    const periodState = App.Monthly.getValuesPeriodState();
    const matrix = App.Monthly.buildMatrixData(table, periodState);
    const selectedIds = new Set(App.Monthly.getPdfSelectedSeriesIds(table));
    const filteredMatrix = {
      ...matrix,
      series: matrix.series.filter((s) => selectedIds.has(s.id)),
    };

    const canvas = document.getElementById('charts-canvas');
    const chartImg = canvas?.width ? canvas.toDataURL('image/png') : '';
    const now = new Date().toLocaleString('fr-FR');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport — ${escapeHtml(table.name)}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 16px; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .meta { color: #555; margin-bottom: 16px; }
    .report-table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    .report-table th, .report-table td { border: 1px solid #333; padding: 4px 6px; text-align: center; }
    .report-table th:first-child, .report-table td:first-child { text-align: left; }
    .report-table th { background: #eee; font-weight: 600; }
    .chart-img { max-width: 100%; height: auto; margin-top: 8px; border: 1px solid #ccc; }
    @media print {
      body { padding: 0; }
      h2 { page-break-after: avoid; }
      .report-table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Rapport statistiques — ${escapeHtml(table.name)}</h1>
  <p class="meta">Généré le ${escapeHtml(now)} · Fichier source : ${escapeHtml(table.sourceFileName || '—')} · ${escapeHtml(periodLabel(periodState))}</p>
  <h2>Tableau des valeurs (${escapeHtml(periodLabel(periodState))})</h2>
  ${buildMatrixHtml(filteredMatrix)}
  ${chartImg ? `<h2>Graphique</h2><img class="chart-img" src="${chartImg}" alt="Graphique">` : ''}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      alert('Impossible d\'ouvrir la fenêtre d\'impression. Autorisez les pop-ups pour ce site.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function init() {
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportPdfReport);
  }

  App.PdfExport = { exportPdfReport, init };

  if (window.AppCore && App.Monthly) {
    App.PdfExport.init();
  }
})(window.AppCore);
