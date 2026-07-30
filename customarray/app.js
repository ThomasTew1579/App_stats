(function () {
  "use strict";

  const TOOL_LABELS = {
    merge: "Merge",
    separator: "Séparateur",
    recurrence: "Compteur d'occurrences",
  };

  const PRESET_VERSION = 1;
  const PREVIEW_ROWS = 12;

  let rawData = [];
  let sourceFileName = "";
  let sheetName = "";
  let headerRow = 0;
  let pipeline = [];
  let selectedStepId = null;
  let runResults = null;
  let processedData = [];
  let modalRecurrence = null;
  let fullResultModalOpen = false;

  const $ = (sel) => document.querySelector(sel);

  const els = {
    fileInput: $("#file-input"),
    fileDrop: $("#file-drop"),
    browseBtn: $("#browse-btn"),
    fileName: $("#file-name"),
    globalHeaderRow: $("#global-header-row"),
    sectionGlobal: $("#section-global"),
    sectionPipeline: $("#section-pipeline"),
    sectionStepConfig: $("#section-step-config"),
    sectionPreview: $("#section-preview"),
    sectionActions: $("#section-actions"),
    sectionResults: $("#section-results"),
    pipelineList: $("#pipeline-list"),
    pipelineEmpty: $("#pipeline-empty"),
    addToolSelect: $("#add-tool-select"),
    btnAddTool: $("#btn-add-tool"),
    stepConfigTitle: $("#step-config-title"),
    stepConfigBody: $("#step-config-body"),
    previewTable: $("#preview-table"),
    previewMeta: $("#preview-meta"),
    previewLegend: $("#preview-legend"),
    btnRunPipeline: $("#btn-run-pipeline"),
    btnExportXlsx: $("#btn-export-xlsx"),
    btnViewFullResult: $("#btn-view-full-result"),
    resultsContent: $("#results-content"),
    btnExportPreset: $("#btn-export-preset"),
    presetInput: $("#preset-input"),
    modalOverlay: $("#modal-overlay"),
    modalTitle: $("#modal-title"),
    modalInfo: $("#modal-info"),
    detailThead: $("#detail-thead"),
    detailTbody: $("#detail-tbody"),
    modalClose: $("#modal-close"),
    modalCloseBtn: $("#modal-close-btn"),
    modalExport: $("#modal-export"),
    fullResultOverlay: $("#full-result-overlay"),
    fullResultMeta: $("#full-result-meta"),
    fullResultLegend: $("#full-result-legend"),
    fullResultTable: $("#full-result-table"),
    fullResultClose: $("#full-result-close"),
    fullResultCloseBtn: $("#full-result-close-btn"),
  };

  /* ── Utils ── */

  function isEmpty(value) {
    return value === null || value === undefined || String(value).trim() === "";
  }

  /** Cellule avec contenu — seules celles-ci sont transformées par les outils. */
  function isProcessableCell(value) {
    return !isEmpty(value);
  }

  function colIndexToLetter(index) {
    let letter = "";
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      letter = String.fromCharCode(65 + rem) + letter;
      n = Math.floor((n - 1) / 26);
    }
    return letter;
  }

  function getCellValue(row, colIndex) {
    if (!row || colIndex < 0) return "";
    const val = row[colIndex];
    return val === null || val === undefined ? "" : val;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function cloneData(data) {
    return data.map((row) => (row ? row.slice() : []));
  }

  function getMaxCols(data) {
    return data.reduce((max, row) => Math.max(max, row ? row.length : 0), 0);
  }

  function getColOptions(data, headerIdx) {
    const headerRowData = data[headerIdx] || [];
    const maxCols = getMaxCols(data);
    const options = [];
    for (let c = 0; c < maxCols; c++) {
      const headerVal = getCellValue(headerRowData, c);
      const letter = colIndexToLetter(c);
      const label = headerVal !== "" ? letter + " — " + headerVal : letter + " — (sans titre)";
      options.push({ value: String(c), label });
    }
    return options;
  }

  function getStepsBeforeStep(stepId) {
    const idx = pipeline.findIndex((s) => s.id === stepId);
    if (idx <= 0) return [];
    return pipeline.slice(0, idx);
  }

  function getDataBeforeStep(stepId) {
    if (!rawData.length) return [];
    const priorSteps = getStepsBeforeStep(stepId).filter((s) => s.enabled);
    if (!priorSteps.length) return cloneData(rawData);
    return runPipelineOnData(rawData, priorSteps, headerRow).data;
  }

  function getColOptionsForStep(stepId) {
    return getColOptions(getDataBeforeStep(stepId), headerRow);
  }

  function clampColIndex(value, maxCols) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0 || maxCols <= 0) return "0";
    if (n >= maxCols) return String(maxCols - 1);
    return String(n);
  }

  function clampStepParams(step) {
    const data = getDataBeforeStep(step.id);
    const maxCols = getMaxCols(data);
    if (maxCols === 0) return;

    const p = step.params;
    switch (step.type) {
      case "merge":
        p.mainCol = clampColIndex(p.mainCol, maxCols);
        p.mergeCol = clampColIndex(p.mergeCol, maxCols);
        if (p.mainCol === p.mergeCol && maxCols > 1) {
          p.mergeCol = p.mainCol === "0" ? "1" : String(parseInt(p.mainCol, 10) - 1 || 1);
        }
        break;
      case "separator":
        p.sourceCol = clampColIndex(p.sourceCol, maxCols);
        break;
      case "recurrence": {
        p.column = clampColIndex(p.column, maxCols);
        if (Array.isArray(p.selectedColumns)) {
          p.selectedColumns = p.selectedColumns.filter((c) => c < maxCols);
        }
        if (!p.selectedColumns || !p.selectedColumns.length) {
          p.selectedColumns = Array.from({ length: maxCols }, (_, i) => i);
        }
        break;
      }
    }
  }

  function clampAllStepParams() {
    pipeline.forEach((step) => clampStepParams(step));
  }

  function uid() {
    return "step_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  }

  function defaultParams(type) {
    switch (type) {
      case "merge":
        return { mainCol: "0", mergeCol: "1", mergeType: "additive" };
      case "separator":
        return { sourceCol: "0", separator: " - ", sepCount: 1, newColNames: ["Partie 1", "Partie 2"] };
      case "recurrence":
        return {
          column: "0",
          constraintType: "none",
          constraintValue: "",
          sortOrder: "desc",
          selectedColumns: null,
          pdfTitle: "",
          pdfDescription: "",
          pdfRowCount: 10,
        };
      default:
        return {};
    }
  }

  function showSectionsAfterImport() {
    els.sectionGlobal.classList.remove("hidden");
    els.sectionPipeline.classList.remove("hidden");
    els.sectionPreview.classList.remove("hidden");
    els.sectionActions.classList.remove("hidden");
  }

  /* ── File import ── */

  els.browseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    els.fileInput.click();
  });

  els.fileDrop.addEventListener("click", () => els.fileInput.click());

  els.fileDrop.addEventListener("dragover", (e) => {
    e.preventDefault();
    els.fileDrop.classList.add("dragover");
  });

  els.fileDrop.addEventListener("dragleave", () => els.fileDrop.classList.remove("dragover"));

  els.fileDrop.addEventListener("drop", (e) => {
    e.preventDefault();
    els.fileDrop.classList.remove("dragover");
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  els.fileInput.addEventListener("change", () => {
    if (els.fileInput.files[0]) loadFile(els.fileInput.files[0]);
  });

  function loadFile(file) {
    sourceFileName = file.name;
    els.fileName.textContent = file.name + " (" + file.size + " octets)";

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: "array" });
      sheetName = wb.SheetNames[0];
      rawData = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "" });
      populateHeaderRowSelect();
      showSectionsAfterImport();
      if (pipeline.length === 0) {
        addStep("merge");
      }
      refreshUI();
    };
    reader.readAsArrayBuffer(file);
  }

  function populateHeaderRowSelect() {
    els.globalHeaderRow.innerHTML = "";
    rawData.forEach((row, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      const preview = (row || []).slice(0, 4).map((c) => String(c).substring(0, 20)).join(" | ");
      opt.textContent = "Ligne " + (i + 1) + " — " + (preview || "(vide)");
      els.globalHeaderRow.appendChild(opt);
    });
    els.globalHeaderRow.value = String(headerRow);
  }

  els.globalHeaderRow.addEventListener("change", () => {
    headerRow = parseInt(els.globalHeaderRow.value, 10);
    refreshUI();
  });

  /* ── Pipeline ── */

  function addStep(type) {
    const step = { id: uid(), type, enabled: true, params: defaultParams(type) };
    pipeline.push(step);
    selectedStepId = step.id;
    renderPipeline();
    renderStepConfig();
    updatePreview();
  }

  els.btnAddTool.addEventListener("click", () => addStep(els.addToolSelect.value));

  function removeStep(id) {
    pipeline = pipeline.filter((s) => s.id !== id);
    if (selectedStepId === id) {
      selectedStepId = pipeline.length ? pipeline[pipeline.length - 1].id : null;
    }
    refreshUI();
  }

  function moveStep(id, dir) {
    const idx = pipeline.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pipeline.length) return;
    const tmp = pipeline[idx];
    pipeline[idx] = pipeline[newIdx];
    pipeline[newIdx] = tmp;
    clampAllStepParams();
    renderPipeline();
    renderStepConfig();
    updatePreview();
  }

  function getStep(id) {
    return pipeline.find((s) => s.id === id);
  }

  function stepSummary(step) {
    const p = step.params;
    const colOpts = getColOptionsForStep(step.id);
    const colLetter = (idx) => colOpts[parseInt(idx, 10)]?.label.split(" — ")[0] || colIndexToLetter(parseInt(idx, 10));

    switch (step.type) {
      case "merge":
        return "Col. " + colLetter(p.mainCol) + " + " + colLetter(p.mergeCol) + " (" + (p.mergeType === "additive" ? "additif" : "soustractif") + ")";
      case "separator":
        return "Col. " + colLetter(p.sourceCol) + ' — sep. « ' + (p.separator || "") + " »";
      case "recurrence":
        return "Col. " + colLetter(p.column) + " — " + (p.constraintType === "none" ? "terme complet" : p.constraintType);
      default:
        return "";
    }
  }

  function renderPipeline() {
    els.pipelineList.innerHTML = "";
    els.pipelineEmpty.classList.toggle("hidden", pipeline.length > 0);

    pipeline.forEach((step, idx) => {
      const li = document.createElement("li");
      li.className = "pipeline-item" + (step.id === selectedStepId ? " selected" : "") + (step.enabled ? "" : " disabled-step");
      li.innerHTML =
        '<span class="pipeline-order">' + (idx + 1) + ".</span>" +
        '<span class="pipeline-badge ' + step.type + '">' + TOOL_LABELS[step.type] + "</span>" +
        '<span class="pipeline-summary">' + escapeHtml(stepSummary(step)) + "</span>" +
        '<div class="pipeline-actions">' +
        '<button type="button" title="Monter" data-action="up" data-id="' + step.id + '">↑</button>' +
        '<button type="button" title="Descendre" data-action="down" data-id="' + step.id + '">↓</button>' +
        '<button type="button" title="Supprimer" data-action="remove" data-id="' + step.id + '">✕</button>' +
        "</div>";

      li.addEventListener("click", (e) => {
        if (e.target.closest(".pipeline-actions")) return;
        selectedStepId = step.id;
        renderPipeline();
        renderStepConfig();
      });

      li.querySelector('[data-action="up"]').addEventListener("click", (e) => {
        e.stopPropagation();
        moveStep(step.id, -1);
      });
      li.querySelector('[data-action="down"]').addEventListener("click", (e) => {
        e.stopPropagation();
        moveStep(step.id, 1);
      });
      li.querySelector('[data-action="remove"]').addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Supprimer cet outil du pipeline ?")) removeStep(step.id);
      });

      els.pipelineList.appendChild(li);
    });
  }

  /* ── Step config ── */

  function renderStepConfig() {
    const step = selectedStepId ? getStep(selectedStepId) : null;
    if (!step || !rawData.length) {
      els.sectionStepConfig.classList.add("hidden");
      return;
    }

    els.sectionStepConfig.classList.remove("hidden");
    els.stepConfigTitle.textContent = "Configuration — " + TOOL_LABELS[step.type];
    els.stepConfigBody.innerHTML = "";

    const toggleDiv = document.createElement("div");
    toggleDiv.className = "step-toggle";
    toggleDiv.innerHTML =
      '<input type="checkbox" id="step-enabled" ' + (step.enabled ? "checked" : "") + ">" +
      "<label for=\"step-enabled\">Activer cette étape</label>";
    toggleDiv.querySelector("#step-enabled").addEventListener("change", (e) => {
      step.enabled = e.target.checked;
      clampAllStepParams();
      renderPipeline();
      renderStepConfig();
      updatePreview();
    });
    els.stepConfigBody.appendChild(toggleDiv);

    const priorCount = getStepsBeforeStep(step.id).filter((s) => s.enabled).length;
    if (priorCount > 0) {
      const hint = document.createElement("p");
      hint.className = "hint step-context-hint";
      hint.textContent =
        "Colonnes listées après " +
        priorCount +
        " étape" +
        (priorCount > 1 ? "s" : "") +
        " précédente" +
        (priorCount > 1 ? "s" : "") +
        " (structure du tableau mise à jour).";
      els.stepConfigBody.appendChild(hint);
    }

    switch (step.type) {
      case "merge":
        renderMergeConfig(step);
        break;
      case "separator":
        renderSeparatorConfig(step);
        break;
      case "recurrence":
        renderRecurrenceConfig(step);
        break;
    }
  }

  function appendEmptyCellHint(type) {
    const hints = {
      merge:
        "Les cellules vides ne sont jamais utilisées comme source. Les cellules vides sans valeur source correspondante restent vides dans le résultat.",
      separator:
        "Les cellules vides ne sont pas séparées : la cellule source reste vide et les colonnes ajoutées sont laissées vides.",
      recurrence:
        "Les cellules vides sont ignorées par l'analyse et conservées telles quelles dans le résultat.",
    };
    const p = document.createElement("p");
    p.className = "hint empty-cell-policy-hint";
    p.textContent = hints[type] || "";
    if (p.textContent) els.stepConfigBody.appendChild(p);
  }

  function buildSelect(label, id, options, value, onChange) {
    const div = document.createElement("div");
    div.className = "form-group";
    const lbl = document.createElement("label");
    lbl.htmlFor = id;
    lbl.textContent = label;
    const sel = document.createElement("select");
    sel.id = id;
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    sel.value = value;
    sel.addEventListener("change", () => {
      onChange(sel.value);
      updatePreview();
      renderPipeline();
    });
    div.appendChild(lbl);
    div.appendChild(sel);
    return div;
  }

  function renderMergeConfig(step) {
    const grid = document.createElement("div");
    grid.className = "form-grid";
    const colOpts = getColOptionsForStep(step.id);
    clampStepParams(step);

    grid.appendChild(
      buildSelect("Colonne principale", "merge-main", colOpts, step.params.mainCol, (v) => {
        step.params.mainCol = v;
      })
    );
    grid.appendChild(
      buildSelect("Colonne pour merge", "merge-col", colOpts, step.params.mergeCol, (v) => {
        step.params.mergeCol = v;
      })
    );
    grid.appendChild(
      buildSelect(
        "Type de merge",
        "merge-type",
        [
          { value: "additive", label: "Additif — copier vers principale si vide" },
          { value: "subtractive", label: "Soustractif — copier vers merge si vide" },
        ],
        step.params.mergeType,
        (v) => {
          step.params.mergeType = v;
        }
      )
    );
    els.stepConfigBody.appendChild(grid);
    appendEmptyCellHint("merge");
  }

  function renderSeparatorConfig(step) {
    const grid = document.createElement("div");
    grid.className = "form-grid";
    const colOpts = getColOptionsForStep(step.id);
    clampStepParams(step);

    grid.appendChild(
      buildSelect("Colonne à séparer", "sep-source", colOpts, step.params.sourceCol, (v) => {
        step.params.sourceCol = v;
        rebuildSepColNames(step);
        renderStepConfig();
      })
    );

    const sepDiv = document.createElement("div");
    sepDiv.className = "form-group";
    sepDiv.innerHTML = '<label for="sep-char">Séparateur</label>';
    const sepInput = document.createElement("input");
    sepInput.type = "text";
    sepInput.id = "sep-char";
    sepInput.value = step.params.separator;
    sepInput.addEventListener("input", () => {
      step.params.separator = sepInput.value;
      updatePreview();
      renderSplitPreview(step);
    });
    sepDiv.appendChild(sepInput);
    grid.appendChild(sepDiv);

    const countDiv = document.createElement("div");
    countDiv.className = "form-group";
    countDiv.innerHTML = '<label for="sep-count">Nombre de séparateurs</label>';
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.id = "sep-count";
    countInput.min = "1";
    countInput.max = "10";
    countInput.value = step.params.sepCount;
    countInput.addEventListener("input", () => {
      step.params.sepCount = parseInt(countInput.value, 10) || 1;
      rebuildSepColNames(step);
      renderStepConfig();
    });
    countDiv.appendChild(countInput);
    grid.appendChild(countDiv);

    els.stepConfigBody.appendChild(grid);

    const namesDiv = document.createElement("div");
    namesDiv.className = "form-group";
    namesDiv.innerHTML = "<label>Noms des colonnes ajoutées</label>";
    const namesList = document.createElement("div");
    namesList.className = "col-names-list";
    const numCols = (step.params.sepCount || 1) + 1;
    while (step.params.newColNames.length < numCols) {
      step.params.newColNames.push("Partie " + (step.params.newColNames.length + 1));
    }
    step.params.newColNames = step.params.newColNames.slice(0, numCols);

    step.params.newColNames.forEach((name, i) => {
      const item = document.createElement("div");
      item.className = "col-name-item";
      item.innerHTML = "<label>Colonne " + (i + 1) + "</label>";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = name;
      inp.addEventListener("input", () => {
        step.params.newColNames[i] = inp.value;
        updatePreview();
        renderSplitPreview(step);
      });
      item.appendChild(inp);
      namesList.appendChild(item);
    });
    namesDiv.appendChild(namesList);
    els.stepConfigBody.appendChild(namesDiv);

    const previewGroup = document.createElement("div");
    previewGroup.className = "form-group";
    previewGroup.innerHTML = "<label>Aperçu séparation (1ère ligne non vide)</label>";
    previewGroup.innerHTML += '<p class="split-preview-meta" id="split-preview-meta"></p>';
    previewGroup.innerHTML += '<div class="split-preview-wrap"><table id="split-preview-table"></table></div>';
    els.stepConfigBody.appendChild(previewGroup);
    renderSplitPreview(step);
    appendEmptyCellHint("separator");
  }

  function rebuildSepColNames(step) {
    const numCols = (step.params.sepCount || 1) + 1;
    const names = step.params.newColNames || [];
    while (names.length < numCols) names.push("Partie " + (names.length + 1));
    step.params.newColNames = names.slice(0, numCols);
  }

  function renderRecurrenceConfig(step) {
    const grid = document.createElement("div");
    grid.className = "form-grid";
    const stepData = getDataBeforeStep(step.id);
    const colOpts = getColOptions(stepData, headerRow);
    clampStepParams(step);

    grid.appendChild(
      buildSelect("Colonne à analyser", "rec-col", colOpts, step.params.column, (v) => {
        step.params.column = v;
        step.params.selectedColumns = null;
      })
    );

    const constraintLabels = {
      none: "Aucune (terme complet)",
      prefix: "Préfixe (N premiers caractères)",
      suffix: "Suffixe (N derniers caractères)",
      contains: "Contient (filtre)",
      regex: "Expression régulière",
    };

    grid.appendChild(
      buildSelect(
        "Contrainte d'analyse",
        "rec-constraint",
        Object.entries(constraintLabels).map(([value, label]) => ({ value, label })),
        step.params.constraintType,
        (v) => {
          step.params.constraintType = v;
          renderStepConfig();
        }
      )
    );

    if (step.params.constraintType !== "none") {
      const valDiv = document.createElement("div");
      valDiv.className = "form-group";
      valDiv.innerHTML = "<label for=\"rec-constraint-val\">Valeur de la contrainte</label>";
      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.id = "rec-constraint-val";
      valInput.value = step.params.constraintValue;
      valInput.addEventListener("input", () => {
        step.params.constraintValue = valInput.value;
        updatePreview();
      });
      valDiv.appendChild(valInput);
      grid.appendChild(valDiv);
    }

    grid.appendChild(
      buildSelect(
        "Tri du rapport",
        "rec-sort",
        [
          { value: "desc", label: "Décroissant" },
          { value: "asc", label: "Croissant" },
        ],
        step.params.sortOrder,
        (v) => {
          step.params.sortOrder = v;
        }
      )
    );

    els.stepConfigBody.appendChild(grid);

    const colsDiv = document.createElement("div");
    colsDiv.className = "form-group";
    colsDiv.innerHTML = "<label>Colonnes visibles (détail / export)</label>";
    const actions = document.createElement("div");
    actions.className = "column-actions";
    actions.innerHTML =
      '<button type="button" class="btn-link" id="rec-cols-all">Tout</button>' +
      '<button type="button" class="btn-link" id="rec-cols-none">Aucun</button>';
    colsDiv.appendChild(actions);

    const checkboxes = document.createElement("div");
    checkboxes.className = "column-checkboxes";
    checkboxes.id = "rec-col-checkboxes";
    const maxCols = getMaxCols(stepData);
    if (!step.params.selectedColumns) {
      step.params.selectedColumns = Array.from({ length: maxCols }, (_, i) => i);
    }

    for (let c = 0; c < maxCols; c++) {
      const label = document.createElement("label");
      label.className = "column-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = String(c);
      input.checked = step.params.selectedColumns.includes(c);
      input.addEventListener("change", () => syncRecColumns(step));
      const letter = document.createElement("span");
      letter.className = "column-check-letter";
      letter.textContent = colIndexToLetter(c);
      const name = document.createElement("span");
      name.textContent = colOpts[c]?.label.split(" — ")[1] || "";
      label.appendChild(input);
      label.appendChild(letter);
      label.appendChild(name);
      checkboxes.appendChild(label);
    }
    colsDiv.appendChild(checkboxes);
    els.stepConfigBody.appendChild(colsDiv);

    actions.querySelector("#rec-cols-all").addEventListener("click", () => {
      checkboxes.querySelectorAll("input").forEach((inp) => {
        inp.checked = true;
      });
      syncRecColumns(step);
    });
    actions.querySelector("#rec-cols-none").addEventListener("click", () => {
      checkboxes.querySelectorAll("input").forEach((inp) => {
        inp.checked = false;
      });
      syncRecColumns(step);
    });

    const pdfGrid = document.createElement("div");
    pdfGrid.className = "form-grid recurrence-pdf-form";
    pdfGrid.style.marginTop = "0.75rem";

    const pdfHeading = document.createElement("h4");
    pdfHeading.className = "recurrence-subheading";
    pdfHeading.textContent = "Rapport PDF";
    els.stepConfigBody.appendChild(pdfHeading);

    const rowDiv = document.createElement("div");
    rowDiv.className = "form-group";
    rowDiv.innerHTML = "<label for=\"rec-pdf-rows\">Nombre de lignes du rapport</label>";
    const rowInp = document.createElement("input");
    rowInp.type = "number";
    rowInp.id = "rec-pdf-rows";
    rowInp.min = "1";
    rowInp.value = step.params.pdfRowCount;
    rowInp.addEventListener("input", () => {
      step.params.pdfRowCount = parseInt(rowInp.value, 10) || 10;
    });
    rowDiv.appendChild(rowInp);
    const rowHint = document.createElement("span");
    rowHint.className = "hint";
    rowHint.textContent = "Termes pris en compte depuis le haut du tableau trié.";
    rowDiv.appendChild(rowHint);
    pdfGrid.appendChild(rowDiv);

    ["pdfTitle", "pdfDescription"].forEach((key) => {
      const div = document.createElement("div");
      div.className = "form-group full-width";
      const lbl = document.createElement("label");
      lbl.textContent = key === "pdfTitle" ? "Titre PDF" : "Description PDF";
      const inp = key === "pdfDescription" ? document.createElement("textarea") : document.createElement("input");
      inp.type = "text";
      inp.value = step.params[key];
      inp.rows = 2;
      inp.addEventListener("input", () => {
        step.params[key] = inp.value;
      });
      div.appendChild(lbl);
      div.appendChild(inp);
      pdfGrid.appendChild(div);
    });

    els.stepConfigBody.appendChild(pdfGrid);
    appendEmptyCellHint("recurrence");
  }

  function syncRecColumns(step) {
    const checked = [];
    document.querySelectorAll("#rec-col-checkboxes input:checked").forEach((inp) => {
      checked.push(parseInt(inp.value, 10));
    });
    step.params.selectedColumns = checked;
  }

  function renderSplitPreview(step) {
    const meta = document.getElementById("split-preview-meta");
    const table = document.getElementById("split-preview-table");
    if (!meta || !table) return;

    const sourceColIdx = parseInt(step.params.sourceCol, 10);
    const separator = step.params.separator;
    const sepCount = step.params.sepCount || 1;
    const previewData = getDataBeforeStep(step.id);
    const found = findFirstNonEmptyRow(previewData, headerRow, sourceColIdx);

    if (!found) {
      meta.textContent = "";
      table.innerHTML = '<caption class="empty-state">Aucune ligne non vide.</caption>';
      return;
    }

    if (!separator) {
      meta.textContent = "Ligne " + (found.rowIndex + 1) + " — « " + found.value + " »";
      table.innerHTML = '<caption class="empty-state">Saisissez un séparateur.</caption>';
      return;
    }

    const parts = splitValue(found.value, separator, sepCount) || [];
    meta.textContent = "Ligne " + (found.rowIndex + 1) + " — original : « " + found.value + " »";
    table.innerHTML = "";
    const trh = document.createElement("tr");
    const trd = document.createElement("tr");
    const th0 = document.createElement("th");
    th0.textContent = "Source";
    th0.className = "col-highlight";
    trh.appendChild(th0);
    const td0 = document.createElement("td");
    td0.textContent = found.value;
    trd.appendChild(td0);
    step.params.newColNames.forEach((name, i) => {
      const th = document.createElement("th");
      th.textContent = name;
      th.className = "col-new";
      trh.appendChild(th);
      const td = document.createElement("td");
      td.textContent = parts[i] ?? "";
      trd.appendChild(td);
    });
    table.innerHTML = "<thead></thead><tbody></tbody>";
    table.querySelector("thead").appendChild(trh);
    table.querySelector("tbody").appendChild(trd);
  }

  function findFirstNonEmptyRow(data, headerIdx, sourceColIdx) {
    for (let r = 0; r < data.length; r++) {
      if (r === headerIdx) continue;
      const val = getCellValue(data[r], sourceColIdx);
      if (!isEmpty(val)) return { rowIndex: r, value: String(val) };
    }
    return null;
  }

  /* ── Processing logic ── */

  function splitValue(value, separator, separatorCount) {
    const str = String(value);
    if (str.trim() === "") return null;
    const parts = [];
    let remaining = str;
    for (let i = 0; i < separatorCount; i++) {
      const idx = remaining.indexOf(separator);
      if (idx === -1) {
        parts.push(remaining);
        remaining = "";
        break;
      }
      parts.push(remaining.substring(0, idx));
      remaining = remaining.substring(idx + separator.length);
    }
    if (parts.length <= separatorCount) parts.push(remaining);
    while (parts.length < separatorCount + 1) parts.push("");
    return parts.slice(0, separatorCount + 1);
  }

  function applyMerge(data, params, headerIdx) {
    const mainCol = parseInt(params.mainCol, 10);
    const mergeCol = parseInt(params.mergeCol, 10);
    const mergeType = params.mergeType;
    const result = cloneData(data);
    const copiedCells = new Set();
    let copiedCount = 0;
    let preservedEmptyCount = 0;
    const dataStartRow = headerIdx + 1;

    for (let r = dataStartRow; r < result.length; r++) {
      const row = result[r];
      if (!row) continue;
      while (row.length <= Math.max(mainCol, mergeCol)) row.push("");

      const mainVal = getCellValue(row, mainCol);
      const mergeVal = getCellValue(row, mergeCol);
      const mainEmpty = isEmpty(mainVal);
      const mergeEmpty = isEmpty(mergeVal);

      if (mainEmpty && mergeEmpty) {
        preservedEmptyCount++;
        continue;
      }

      if (mergeType === "additive") {
        if (mergeEmpty) {
          preservedEmptyCount++;
          continue;
        }
        if (mainEmpty && isProcessableCell(mergeVal)) {
          row[mainCol] = mergeVal;
          copiedCells.add(r + "," + mainCol);
          copiedCount++;
        }
      } else if (mergeType === "subtractive") {
        if (mainEmpty) {
          preservedEmptyCount++;
          continue;
        }
        if (mergeEmpty && isProcessableCell(mainVal)) {
          row[mergeCol] = mainVal;
          copiedCells.add(r + "," + mergeCol);
          copiedCount++;
        }
      }
    }

    return {
      data: result,
      meta: { copiedCount, emptyCount: preservedEmptyCount, preservedEmptyCount, copiedCells, mainCol, mergeCol },
    };
  }

  function applySeparator(data, params, headerIdx) {
    const sourceColIdx = parseInt(params.sourceCol, 10);
    const separator = params.separator;
    const sepCount = params.sepCount || 1;
    const newColNames = params.newColNames || [];
    const result = cloneData(data);
    const header = result[headerIdx] || [];
    const newColIndices = [];

    for (let i = 1; i <= newColNames.length; i++) {
      newColIndices.push(sourceColIdx + i);
    }

    header.splice(sourceColIdx + 1, 0, ...newColNames);
    result[headerIdx] = header;

    let processedRows = 0;
    let preservedEmptyRows = 0;

    for (let r = 0; r < result.length; r++) {
      if (r === headerIdx) continue;
      const row = result[r];
      if (!row) continue;
      while (row.length <= sourceColIdx) row.push("");

      const cellValue = row[sourceColIdx];

      if (!isProcessableCell(cellValue) || !separator) {
        preservedEmptyRows++;
        row.splice(sourceColIdx + 1, 0, ...new Array(newColNames.length).fill(""));
        continue;
      }

      const parts = splitValue(cellValue, separator, sepCount);
      if (!parts) {
        preservedEmptyRows++;
        row.splice(sourceColIdx + 1, 0, ...new Array(newColNames.length).fill(""));
        continue;
      }

      row.splice(sourceColIdx + 1, 0, ...parts);
      processedRows++;
    }

    return {
      data: result,
      meta: { processedRows, emptyRows: preservedEmptyRows, preservedEmptyRows, sourceColIdx, newColIndices },
    };
  }

  function extractTerm(value, constraintType, constraintValue) {
    const str = String(value ?? "").trim();
    if (!str) return null;
    const param = constraintValue.trim();

    switch (constraintType) {
      case "none":
        return str;
      case "prefix": {
        const n = parseInt(param, 10);
        return n > 0 ? str.substring(0, n) : str;
      }
      case "suffix": {
        const n = parseInt(param, 10);
        return n > 0 ? str.slice(-n) : str;
      }
      case "contains":
        return param && str.includes(param) ? str : null;
      case "regex":
        if (!param) return str;
        try {
          const re = new RegExp(param);
          return re.test(str) ? str.match(re)[0] : null;
        } catch {
          return null;
        }
      default:
        return str;
    }
  }

  function applyRecurrence(data, params, headerIdx) {
    const colIdx = parseInt(params.column, 10);
    const map = new Map();
    let preservedEmptyCount = 0;

    for (let r = headerIdx + 1; r < data.length; r++) {
      const row = data[r];
      if (!row) continue;
      const cellValue = getCellValue(row, colIdx);
      if (!isProcessableCell(cellValue)) {
        preservedEmptyCount++;
        continue;
      }
      const term = extractTerm(cellValue, params.constraintType, params.constraintValue);
      if (term == null || term === "") {
        preservedEmptyCount++;
        continue;
      }
      if (!map.has(term)) map.set(term, []);
      map.get(term).push(r);
    }

    const desc = params.sortOrder === "desc";
    const entries = [...map.entries()]
      .map(([term, rows]) => ({ term, count: rows.length, rows }))
      .sort((a, b) => (desc ? b.count - a.count : a.count - b.count) || a.term.localeCompare(b.term, "fr"));

    return { data, meta: { entries, colIdx, preservedEmptyCount } };
  }

  function runPipelineOnData(data, steps, headerIdx, stopAtStepId) {
    let current = cloneData(data);
    const stepResults = [];
    const highlights = { copiedCells: new Set(), sourceCols: new Set(), newCols: new Set() };

    for (const step of steps) {
      if (!step.enabled) continue;
      let result;
      switch (step.type) {
        case "merge":
          result = applyMerge(current, step.params, headerIdx);
          result.meta.copiedCells.forEach((k) => highlights.copiedCells.add(k));
          current = result.data;
          break;
        case "separator":
          result = applySeparator(current, step.params, headerIdx);
          highlights.sourceCols.add(result.meta.sourceColIdx);
          result.meta.newColIndices.forEach((c) => highlights.newCols.add(c));
          current = result.data;
          break;
        case "recurrence":
          result = applyRecurrence(current, step.params, headerIdx);
          break;
        default:
          continue;
      }
      stepResults.push({ stepId: step.id, type: step.type, meta: result.meta });
      if (stopAtStepId && step.id === stopAtStepId) break;
    }

    return { data: current, stepResults, highlights };
  }

  function computePreviewData() {
    if (!rawData.length) return [];
    const enabledSteps = pipeline.filter((s) => s.enabled);
    return runPipelineOnData(rawData, enabledSteps, headerRow).data;
  }

  function getPreviewLegendHtml() {
    return (
      '<span class="legend-item"><span class="swatch header"></span> Ligne titres</span>' +
      '<span class="legend-item"><span class="swatch source"></span> Colonne source</span>' +
      '<span class="legend-item"><span class="swatch new-col"></span> Colonnes ajoutées</span>' +
      '<span class="legend-item"><span class="swatch copied"></span> Cellule copiée (merge)</span>'
    );
  }

  function renderProcessedTable(tableEl, data, highlights, options) {
    const maxRows = options.maxRows;
    const showRowNum = options.showRowNum === true;
    const maxCols = getMaxCols(data);
    const totalRows = data.length;
    const rowsToShow = maxRows == null ? totalRows : Math.min(maxRows, totalRows);

    tableEl.innerHTML = "";
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    for (let r = 0; r < rowsToShow; r++) {
      const row = data[r] || [];
      const tr = document.createElement("tr");
      if (r === headerRow) tr.classList.add("header-row-highlight");

      if (showRowNum) {
        const numCell = document.createElement(r === headerRow ? "th" : "td");
        numCell.className = "row-num";
        numCell.textContent = r === headerRow ? "#" : String(r + 1);
        tr.appendChild(numCell);
      }

      for (let c = 0; c < maxCols; c++) {
        const cell = document.createElement(r === headerRow ? "th" : "td");
        const val = getCellValue(row, c);
        cell.textContent = isEmpty(val) ? "" : String(val);

        if (highlights.sourceCols.has(c)) cell.classList.add("col-highlight");
        if (highlights.newCols.has(c)) cell.classList.add("col-new");
        if (highlights.copiedCells.has(r + "," + c)) cell.classList.add("copied");
        if (isEmpty(val) && r !== headerRow) cell.classList.add("empty");

        tr.appendChild(cell);
      }

      if (r === headerRow) thead.appendChild(tr);
      else tbody.appendChild(tr);
    }

    tableEl.appendChild(thead);
    tableEl.appendChild(tbody);

    return { totalRows, maxCols, rowsToShow };
  }

  /* ── Live preview ── */

  function updatePreview() {
    if (!rawData.length) return;

    const { data, highlights } = runPipelineOnData(rawData, pipeline.filter((s) => s.enabled), headerRow);

    const previewStats = renderProcessedTable(els.previewTable, data, highlights, {
      maxRows: PREVIEW_ROWS,
      showRowNum: false,
    });

    els.previewMeta.textContent =
      "Aperçu des " + previewStats.rowsToShow + " premières lignes sur " + previewStats.totalRows + " — pipeline appliqué en temps réel";
    els.previewLegend.innerHTML = getPreviewLegendHtml();

    if (fullResultModalOpen) {
      updateFullResultModal(data, highlights);
    }
  }

  function updateFullResultModal(data, highlights) {
    if (!data) {
      const result = runPipelineOnData(rawData, pipeline.filter((s) => s.enabled), headerRow);
      data = result.data;
      highlights = result.highlights;
    }

    const stats = renderProcessedTable(els.fullResultTable, data, highlights, {
      maxRows: null,
      showRowNum: true,
    });

    els.fullResultMeta.textContent =
      stats.totalRows + " lignes · " + stats.maxCols + " colonnes — mise à jour en direct";
    els.fullResultLegend.innerHTML = getPreviewLegendHtml();
  }

  function openFullResultModal() {
    if (!rawData.length) return;
    fullResultModalOpen = true;
    updateFullResultModal();
    els.fullResultOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeFullResultModal() {
    fullResultModalOpen = false;
    els.fullResultOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  if (els.btnViewFullResult) {
    els.btnViewFullResult.addEventListener("click", openFullResultModal);
  }
  if (els.fullResultClose) {
    els.fullResultClose.addEventListener("click", closeFullResultModal);
  }
  if (els.fullResultCloseBtn) {
    els.fullResultCloseBtn.addEventListener("click", closeFullResultModal);
  }
  if (els.fullResultOverlay) {
    els.fullResultOverlay.addEventListener("click", (e) => {
      if (e.target === els.fullResultOverlay) closeFullResultModal();
    });
  }

  /* ── Run & Export ── */

  els.btnRunPipeline.addEventListener("click", () => {
    if (!rawData.length) return;
    const result = runPipelineOnData(rawData, pipeline, headerRow);
    processedData = result.data;
    runResults = result.stepResults;
    renderResults();
    els.sectionResults.classList.remove("hidden");
    els.sectionResults.scrollIntoView({ behavior: "smooth" });
  });

  els.btnExportXlsx.addEventListener("click", () => {
    const data = processedData.length ? processedData : computePreviewData();
    if (!data.length) return;
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName || "Feuille1");
    const base = sourceFileName.replace(/\.xlsx?$/i, "") || "export";
    XLSX.writeFile(wb, base + "_customarray.xlsx");
  });

  function renderResults() {
    els.resultsContent.innerHTML = "";
    if (!runResults || !runResults.length) {
      els.resultsContent.innerHTML = '<p class="empty-state">Aucun résultat.</p>';
      return;
    }

    runResults.forEach((res, idx) => {
      const step = getStep(res.stepId);
      if (!step) return;
      const block = document.createElement("div");
      block.className = "result-block";
      block.innerHTML = "<h3>Étape " + (idx + 1) + " — " + TOOL_LABELS[res.type] + "</h3>";

      if (res.type === "merge") {
        block.innerHTML +=
          '<div class="result-stats">' +
          '<div class="stat"><span class="stat-value">' + res.meta.copiedCount + '</span><span class="stat-label">Valeurs copiées</span></div>' +
          '<div class="stat"><span class="stat-value">' + (res.meta.preservedEmptyCount ?? res.meta.emptyCount) + '</span><span class="stat-label">Cellules vides conservées</span></div>' +
          "</div>";
      } else if (res.type === "separator") {
        block.innerHTML +=
          '<div class="result-stats">' +
          '<div class="stat"><span class="stat-value">' + res.meta.processedRows + '</span><span class="stat-label">Lignes traitées</span></div>' +
          '<div class="stat"><span class="stat-value">' + (res.meta.preservedEmptyRows ?? res.meta.emptyRows) + '</span><span class="stat-label">Cellules vides conservées</span></div>' +
          "</div>";
      } else if (res.type === "recurrence") {
        const entries = res.meta.entries;
        const total = entries.reduce((s, e) => s + e.count, 0);
        block.innerHTML +=
          '<p class="hint">' + entries.length + " terme(s) distinct(s) · " + total + " occurrence(s)" +
          (res.meta.preservedEmptyCount != null
            ? " · " + res.meta.preservedEmptyCount + " cellule(s) vide(s) ignorée(s)"
            : "") +
          "</p>";

        const controls = document.createElement("div");
        controls.className = "recurrence-controls recurrence-report-options";

        const rowLabel = document.createElement("label");
        rowLabel.htmlFor = "result-pdf-rows-" + res.stepId;
        rowLabel.textContent = "Lignes du rapport :";
        controls.appendChild(rowLabel);

        const rowInput = document.createElement("input");
        rowInput.type = "number";
        rowInput.id = "result-pdf-rows-" + res.stepId;
        rowInput.min = "1";
        rowInput.max = String(Math.max(entries.length, 1));
        rowInput.value = String(Math.min(step.params.pdfRowCount || 10, Math.max(entries.length, 1)));
        rowInput.className = "recurrence-row-count-input";
        rowInput.addEventListener("input", () => {
          const max = Math.max(entries.length, 1);
          const val = Math.min(Math.max(parseInt(rowInput.value, 10) || 1, 1), max);
          step.params.pdfRowCount = val;
          rowInput.value = String(val);
          refreshRecurrenceResultTable(tbody, entries, val, res.stepId);
        });
        controls.appendChild(rowInput);

        const pdfBtn = document.createElement("button");
        pdfBtn.type = "button";
        pdfBtn.className = "btn btn-secondary btn-sm";
        pdfBtn.textContent = "Générer PDF";
        pdfBtn.addEventListener("click", () => generatePdfReport(step, entries));
        controls.appendChild(pdfBtn);
        block.appendChild(controls);

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        wrap.style.maxHeight = "300px";
        wrap.style.overflow = "auto";
        const table = document.createElement("table");
        table.innerHTML =
          "<thead><tr><th>#</th><th>Terme</th><th>Occurrences</th><th>Actions</th></tr></thead><tbody></tbody>";
        const tbody = table.querySelector("tbody");
        const displayCount = Math.min(step.params.pdfRowCount || 10, entries.length);
        refreshRecurrenceResultTable(tbody, entries, displayCount, res.stepId);

        wrap.appendChild(table);
        block.appendChild(wrap);
      }

      els.resultsContent.appendChild(block);
    });
  }

  /* ── Recurrence modal ── */

  function openRecurrenceModal(step, term, entries) {
    const entry = entries.find((e) => e.term === term);
    if (!entry) return;

    modalRecurrence = { step, term, rows: entry.rows };
    const visibleCols = step.params.selectedColumns || [];
    if (!visibleCols.length) {
      alert("Sélectionnez au moins une colonne.");
      return;
    }

    const data = processedData.length ? processedData : computePreviewData();
    els.modalTitle.textContent = "Détail : « " + term + " »";
    els.modalInfo.textContent = entry.count + " ligne(s) correspondante(s)";

    const theadRow = document.createElement("tr");
    theadRow.innerHTML = "<th>Ligne Excel</th>";
    visibleCols.forEach((c) => {
      const th = document.createElement("th");
      const opts = getColOptions(data, headerRow);
      th.textContent = opts[c]?.label || colIndexToLetter(c);
      theadRow.appendChild(th);
    });
    els.detailThead.innerHTML = "";
    els.detailThead.appendChild(theadRow);

    els.detailTbody.innerHTML = "";
    entry.rows.forEach((rowIdx) => {
      const row = data[rowIdx] || [];
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (rowIdx + 1) + "</td>";
      visibleCols.forEach((c) => {
        const td = document.createElement("td");
        td.textContent = getCellValue(row, c);
        tr.appendChild(td);
      });
      els.detailTbody.appendChild(tr);
    });

    els.modalOverlay.classList.remove("hidden");
  }

  function closeModal() {
    els.modalOverlay.classList.add("hidden");
    modalRecurrence = null;
  }

  els.modalClose.addEventListener("click", closeModal);
  els.modalCloseBtn.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!els.fullResultOverlay.classList.contains("hidden")) closeFullResultModal();
    else if (!els.modalOverlay.classList.contains("hidden")) closeModal();
  });

  els.modalExport.addEventListener("click", () => {
    if (!modalRecurrence) return;
    const { step, term, rows } = modalRecurrence;
    const visibleCols = step.params.selectedColumns || [];
    const data = processedData.length ? processedData : computePreviewData();
    const headers = ["Ligne Excel", ...visibleCols.map((c) => getColOptions(data, headerRow)[c]?.label || colIndexToLetter(c))];
    const exportData = [headers];
    rows.forEach((rowIdx) => {
      const row = data[rowIdx] || [];
      exportData.push([String(rowIdx + 1), ...visibleCols.map((c) => getCellValue(row, c))]);
    });
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Détail");
    const safeTerm = term.replace(/[\\/*?:\[\]]/g, "_").substring(0, 30);
    XLSX.writeFile(wb, (sourceFileName.replace(/\.xlsx?$/i, "") || "export") + "_detail_" + safeTerm + ".xlsx");
  });

  function refreshRecurrenceResultTable(tbody, entries, count, stepId) {
    tbody.innerHTML = "";
    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Aucun terme trouvé.</td></tr>';
      return;
    }
    entries.slice(0, count).forEach((entry, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + (i + 1) + "</td>" +
        "<td>" + escapeHtml(entry.term) + "</td>" +
        "<td>" + entry.count + "</td>" +
        '<td><button type="button" class="btn-link" data-term="' + escapeAttr(entry.term) + '" data-step="' + stepId + '">Détail</button></td>';
      tr.querySelector(".btn-link").addEventListener("click", () => {
        const step = getStep(stepId);
        if (step) openRecurrenceModal(step, entry.term, entries);
      });
      tbody.appendChild(tr);
    });
  }

  function pdfContentWidth(doc, margin) {
    return doc.internal.pageSize.getWidth() - margin * 2;
  }

  function pdfEqualColumnStyles(colCount, tableWidth) {
    const cellWidth = tableWidth / colCount;
    const styles = {};
    for (let i = 0; i < colCount; i++) {
      styles[i] = { cellWidth };
    }
    return styles;
  }

  /* ── PDF export ── */

  function generatePdfReport(step, entries) {
    if (typeof window.jspdf === "undefined") {
      alert("Bibliothèque PDF non chargée.");
      return;
    }
    const visibleCols = step.params.selectedColumns || [];
    if (!visibleCols.length) {
      alert("Sélectionnez au moins une colonne.");
      return;
    }

    const n = Math.min(Math.max(step.params.pdfRowCount || 10, 1), entries.length);
    const selected = entries.slice(0, n);
    if (!selected.length) {
      alert("Aucun terme à exporter.");
      return;
    }

    const data = processedData.length ? processedData : computePreviewData();
    const title = step.params.pdfTitle || "Rapport de récurrence";
    const description = step.params.pdfDescription || "";
    const { jsPDF } = window.jspdf;
    const PDF_MARGIN = 14;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const tableWidth = pdfContentWidth(doc, PDF_MARGIN);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, PDF_MARGIN, PDF_MARGIN + 4);

    let y = PDF_MARGIN + 12;
    if (description.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(description.trim(), tableWidth);
      doc.text(lines, PDF_MARGIN, y);
      y += lines.length * 5 + 4;
    }

    doc.autoTable({
      head: [["#", "Terme", "Occurrences"]],
      body: selected.map((e, i) => [String(i + 1), e.term, String(e.count)]),
      startY: y + 4,
      margin: { left: PDF_MARGIN, right: PDF_MARGIN },
      tableWidth,
      columnStyles: pdfEqualColumnStyles(3, tableWidth),
      headStyles: { fillColor: [37, 99, 235] },
    });

    selected.forEach((entry) => {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Détail — « " + entry.term + " » (" + entry.count + " occ.)", PDF_MARGIN, PDF_MARGIN + 8);

      const head = [["Ligne Excel", ...visibleCols.map((c) => getColOptions(data, headerRow)[c]?.label || colIndexToLetter(c))]];
      const body = entry.rows.map((rowIdx) => {
        const row = data[rowIdx] || [];
        return [String(rowIdx + 1), ...visibleCols.map((c) => String(getCellValue(row, c)))];
      });
      const detailColCount = head[0].length;

      doc.autoTable({
        head,
        body,
        startY: PDF_MARGIN + 14,
        margin: { left: PDF_MARGIN, right: PDF_MARGIN },
        tableWidth,
        columnStyles: pdfEqualColumnStyles(detailColCount, tableWidth),
        styles: { fontSize: 7, overflow: "linebreak" },
        headStyles: { fillColor: [60, 75, 95] },
      });
    });

    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Page " + i + " / " + total, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
    }

    doc.save((sourceFileName.replace(/\.xlsx?$/i, "") || "rapport") + "_recurrence.pdf");
  }

  /* ── Presets ── */

  els.btnExportPreset.addEventListener("click", () => {
    const preset = {
      version: PRESET_VERSION,
      headerRow,
      pipeline: pipeline.map((s) => ({
        type: s.type,
        enabled: s.enabled,
        params: { ...s.params },
      })),
    };
    const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "customarray_preset.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  els.presetInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const preset = JSON.parse(ev.target.result);
        applyPreset(preset);
      } catch {
        alert("Fichier JSON invalide.");
      }
      els.presetInput.value = "";
    };
    reader.readAsText(file);
  });

  function applyPreset(preset) {
    if (!preset || !Array.isArray(preset.pipeline)) {
      alert("Format de preset invalide.");
      return;
    }
    headerRow = preset.headerRow || 0;
    if (els.globalHeaderRow.options.length) {
      els.globalHeaderRow.value = String(Math.min(headerRow, rawData.length - 1));
      headerRow = parseInt(els.globalHeaderRow.value, 10);
    }
    pipeline = preset.pipeline.map((s) => ({
      id: uid(),
      type: s.type,
      enabled: s.enabled !== false,
      params: { ...defaultParams(s.type), ...s.params },
    }));
    selectedStepId = pipeline.length ? pipeline[0].id : null;
    refreshUI();
  }

  /* ── Refresh ── */

  function refreshUI() {
    clampAllStepParams();
    renderPipeline();
    renderStepConfig();
    updatePreview();
  }

  /* ── Theme ── */

  const THEME_KEY = "customarray-theme";
  const btnThemeToggle = document.getElementById("btn-theme-toggle");

  function updateThemeButton(theme) {
    if (!btnThemeToggle) return;
    if (theme === "light") {
      btnThemeToggle.textContent = "🌙 Mode sombre";
      btnThemeToggle.setAttribute("aria-label", "Passer en mode sombre");
    } else {
      btnThemeToggle.textContent = "☀ Mode clair";
      btnThemeToggle.setAttribute("aria-label", "Passer en mode clair");
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeButton(theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    setTheme(saved === "light" ? "light" : "dark");
  }

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      setTheme(current === "dark" ? "light" : "dark");
    });
  }

  initTheme();
})();
