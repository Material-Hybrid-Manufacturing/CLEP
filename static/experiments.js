(function () {
  "use strict";

  const state = {
    types: [],
    options: { galvo_scanners: [], f_theta_lenses: [], laser_diodes: [] },
    equipment: { galvo: [], lens: [] },
    rows: [],
    expanderOn: false,
    selectedImage: null,
    editingId: null,
  };

  // ============================================================
  // Helpers
  // ============================================================
  function $(id) { return document.getElementById(id); }

  function fmt(value, digits) {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    if (Math.abs(value) >= 1000) return Number(value).toFixed(0);
    return Number(value).toFixed(digits);
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ============================================================
  // Data loading
  // ============================================================
  async function fetchTypes() {
    const res = await fetch("/experiments/test-types");
    state.types = res.ok ? await res.json() : [];
    renderTestTypeSelect();
    renderTypeManager();
    renderFilterCheckboxes("filter-test-types", state.types.map((t) => t.name));
  }

  function equipmentLabel(row) {
    const mfr = (row.manufacturer || "").trim();
    const model = (row.model_number || "").trim();
    if (mfr && model) return `${mfr} ${model}`;
    return mfr || model || `#${row.id}`;
  }

  function populateEquipmentSelect(selectId, items, placeholder) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = placeholder;
    sel.appendChild(empty);
    items.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = equipmentLabel(row);
      opt.textContent = equipmentLabel(row);
      sel.appendChild(opt);
    });
    if (prev && Array.from(sel.options).some((o) => o.value === prev)) {
      sel.value = prev;
    } else {
      sel.value = "";
    }
  }

  async function fetchEquipment() {
    const [galvo, lens] = await Promise.all([
      fetch("/equipment/galvo").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/equipment/lens").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    state.equipment.galvo = galvo;
    state.equipment.lens = lens;
    populateEquipmentSelect("ns-galvo", galvo, "— Select Galvo Scanner —");
    populateEquipmentSelect("ns-lens", lens, "— Select F-Theta Lens —");
  }

  async function fetchOptions() {
    const res = await fetch("/experiments/filter-options");
    state.options = res.ok
      ? await res.json()
      : { galvo_scanners: [], f_theta_lenses: [], laser_diodes: [] };
    renderFilterCheckboxes("filter-galvo", state.options.galvo_scanners || []);
    renderFilterCheckboxes("filter-lens", state.options.f_theta_lenses || []);
    renderFilterCheckboxes("filter-diode", state.options.laser_diodes || []);
  }

  async function loadExperiments(filters) {
    const qs = buildQuery(filters || {});
    const url = qs ? `/experiments?${qs}` : "/experiments";
    const res = await fetch(url);
    state.rows = res.ok ? await res.json() : [];
    renderGrid();
  }

  function buildQuery(filters) {
    const parts = [];
    for (const [key, val] of Object.entries(filters)) {
      if (val === null || val === undefined || val === "") continue;
      if (Array.isArray(val)) {
        if (val.length === 0) continue;
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val.join(","))}`);
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      }
    }
    return parts.join("&");
  }

  // ============================================================
  // Rendering
  // ============================================================
  function renderTestTypeSelect() {
    const sel = $("ns-test-type");
    const prev = sel.value;
    sel.innerHTML = "";
    if (state.types.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "— add a test type —";
      opt.value = "";
      sel.appendChild(opt);
      return;
    }
    state.types.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.name;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
    if (prev && state.types.some((t) => t.name === prev)) sel.value = prev;
  }

  function renderTypeManager() {
    const list = $("type-manager-list");
    list.innerHTML = "";
    if (state.types.length === 0) {
      const empty = document.createElement("div");
      empty.className = "filter-empty";
      empty.textContent = "No test types yet.";
      list.appendChild(empty);
      return;
    }
    state.types.forEach((t) => {
      const row = document.createElement("div");
      row.className = "row";
      const span = document.createElement("span");
      span.textContent = t.name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.title = "Delete";
      btn.addEventListener("click", async () => {
        if (!confirm(`Delete test type "${t.name}"?`)) return;
        await fetch(`/experiments/test-types/${t.id}`, { method: "DELETE" });
        await fetchTypes();
      });
      row.append(span, btn);
      list.appendChild(row);
    });
  }

  function renderFilterCheckboxes(elId, values) {
    const el = $(elId);
    if (!el) return;
    el.innerHTML = "";
    if (!values || values.length === 0) {
      const empty = document.createElement("div");
      empty.className = "filter-empty";
      empty.textContent = "No values yet.";
      el.appendChild(empty);
      return;
    }
    values.forEach((v) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = v;
      label.append(input, document.createTextNode(" " + v));
      el.appendChild(label);
    });
  }

  function renderGrid() {
    const grid = $("exp-grid");
    grid.innerHTML = "";
    if (state.rows.length === 0) {
      $("exp-empty").classList.remove("hidden");
      return;
    }
    $("exp-empty").classList.add("hidden");
    state.rows.forEach((row) => grid.appendChild(buildCard(row)));
  }

  function buildCard(row) {
    const a = document.createElement("a");
    a.className = "exp-card";
    a.href = "#";
    a.dataset.id = row.id;

    const img = document.createElement("div");
    img.className = "exp-image";
    if (row.image_path) {
      img.style.backgroundImage = `url("${row.image_path}")`;
    } else {
      img.classList.add("placeholder");
    }
    if (row.test_type) {
      const badge = document.createElement("span");
      badge.className = "exp-badge";
      badge.textContent = row.test_type;
      img.appendChild(badge);
    }

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "exp-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openEditOverlay(row);
    });
    img.appendChild(editBtn);

    const meta = document.createElement("div");
    meta.className = "exp-meta";

    const label = document.createElement("div");
    label.className = "exp-label";
    label.textContent = row.specimen_label || "(unlabeled)";

    const date = document.createElement("div");
    date.className = "exp-date";
    date.textContent = formatDate(row.created_at);

    const equipParts = [];
    if (row.galvo_scanner) equipParts.push(["Galvo", row.galvo_scanner]);
    if (row.f_theta_lens) equipParts.push(["Lens", row.f_theta_lens]);
    if (row.laser_diode) equipParts.push(["Diode", row.laser_diode]);

    const params = document.createElement("div");
    params.className = "exp-params";
    const paramsList = [];
    if (row.power) paramsList.push(`${fmt(row.power, 1)} W`);
    if (row.scan_speed) paramsList.push(`${fmt(row.scan_speed, 0)} mm/s`);
    if (row.spot_diameter) paramsList.push(`${fmt(row.spot_diameter, 1)} µm`);
    params.textContent = paramsList.join(" · ");

    const metrics = document.createElement("div");
    metrics.className = "exp-metrics";
    metrics.innerHTML =
      `<div><span class="muted">Fluence</span>${row.fluence != null ? fmt(row.fluence, 2) + " J/mm²" : "—"}</div>` +
      `<div><span class="muted">VED</span>${row.ved != null ? fmt(row.ved, 1) + " J/mm³" : "—"}</div>`;

    const notes = document.createElement("div");
    notes.className = "exp-notes";
    notes.textContent = row.notes || "";

    meta.append(label, date);
    equipParts.forEach(([k, v]) => {
      const eq = document.createElement("div");
      eq.className = "exp-equip";
      const muted = document.createElement("span");
      muted.className = "muted";
      muted.textContent = k;
      eq.append(muted, document.createTextNode(" " + v));
      meta.appendChild(eq);
    });
    if (paramsList.length) meta.appendChild(params);
    meta.append(metrics, notes);

    a.append(img, meta);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      openDetail(row);
    });
    return a;
  }

  // ============================================================
  // Filter panel
  // ============================================================
  $("filter-toggle").addEventListener("click", () => {
    $("filter-panel").classList.toggle("collapsed");
  });

  $("apply-filters").addEventListener("click", () => {
    const filters = collectFilters();
    loadExperiments(filters);
  });

  $("clear-filters").addEventListener("click", () => {
    document.querySelectorAll("#filter-panel input[type=checkbox]")
      .forEach((cb) => (cb.checked = false));
    document.querySelectorAll("#filter-panel input[type=number]")
      .forEach((inp) => (inp.value = ""));
    loadExperiments({});
  });

  function collectFilters() {
    const out = {};
    const grab = (containerId, key) => {
      const checked = Array.from(document.querySelectorAll(`#${containerId} input:checked`))
        .map((cb) => cb.value);
      if (checked.length) out[key] = checked;
    };
    grab("filter-test-types", "test_types");
    grab("filter-galvo", "galvo_scanners");
    grab("filter-lens", "f_theta_lenses");
    grab("filter-diode", "laser_diodes");
    document.querySelectorAll("#filter-panel input[data-range]").forEach((inp) => {
      const v = inp.value.trim();
      if (v !== "") out[inp.dataset.range] = v;
    });
    return out;
  }

  // ============================================================
  // New specimen overlay
  // ============================================================
  const overlay = $("overlay-new-specimen");

  function syncExpanderVisual() {
    const btn = $("ns-expander-toggle");
    btn.classList.toggle("on", state.expanderOn);
    btn.classList.toggle("off", !state.expanderOn);
    btn.setAttribute("aria-pressed", String(state.expanderOn));
    btn.querySelector(".toggle-mark").textContent = state.expanderOn ? "✓" : "✕";
    btn.querySelector(".toggle-label").textContent = state.expanderOn ? "On" : "Off";
    $("ns-expander-fields").classList.toggle("collapsed", !state.expanderOn);
  }

  function setOverlayMode(mode) {
    const title = overlay.querySelector(".overlay-pane h2");
    const saveBtn = $("save-specimen-btn");
    if (mode === "edit") {
      if (title) title.textContent = "Edit Specimen";
      if (saveBtn) saveBtn.textContent = "Update Specimen";
    } else {
      if (title) title.textContent = "New Specimen";
      if (saveBtn) saveBtn.textContent = "Save Specimen";
    }
  }

  function setSelectValueWithFallback(selectId, value) {
    const sel = $(selectId);
    if (!sel) return;
    if (!value) { sel.value = ""; return; }
    const exists = Array.from(sel.options).some((o) => o.value === value);
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = `${value} (legacy)`;
      sel.appendChild(opt);
    }
    sel.value = value;
  }

  function clearSpecimenForm() {
    ["ns-label", "ns-diode", "ns-expander-model",
     "ns-power", "ns-speed", "ns-spot", "ns-hatch", "ns-layer",
     "ns-strategy", "ns-notes"].forEach((id) => { $(id).value = ""; });
    $("ns-test-type").value = "";
    $("ns-galvo").value = "";
    $("ns-lens").value = "";
    state.expanderOn = false;
    syncExpanderVisual();
    state.selectedImage = null;
    $("image-preview").hidden = true;
    $("image-preview").style.backgroundImage = "";
    $("preview-result").innerHTML = "";
  }

  function openOverlay() {
    state.editingId = null;
    setOverlayMode("create");
    clearSpecimenForm();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    $("overlay-error").classList.add("hidden");
    $("type-manager").classList.add("hidden");
    fetchEquipment();
    prefillSpotFromCalculator();
  }

  async function openEditOverlay(row) {
    state.editingId = row.id;
    setOverlayMode("edit");
    clearSpecimenForm();
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    $("overlay-error").classList.add("hidden");
    $("type-manager").classList.add("hidden");

    $("ns-label").value = row.specimen_label || "";
    setSelectValueWithFallback("ns-test-type", row.test_type || "");
    $("ns-diode").value = row.laser_diode || "";
    $("ns-power").value = row.power ?? "";
    $("ns-speed").value = row.scan_speed ?? "";
    $("ns-spot").value = row.spot_diameter ?? "";
    $("ns-hatch").value = row.hatch_distance ?? "";
    $("ns-layer").value = row.layer_thickness ?? "";
    $("ns-strategy").value = row.scan_strategy || "";
    $("ns-notes").value = row.notes || "";
    state.expanderOn = !!row.beam_expander;
    syncExpanderVisual();
    $("ns-expander-model").value = row.beam_expander_model || "";

    if (row.image_path) {
      $("image-preview").hidden = false;
      $("image-preview").style.backgroundImage = `url("${row.image_path}")`;
    }

    await fetchEquipment();
    setSelectValueWithFallback("ns-galvo", row.galvo_scanner || "");
    setSelectValueWithFallback("ns-lens", row.f_theta_lens || "");
  }

  function prefillSpotFromCalculator() {
    const calcOut = document.getElementById("out-spot");
    const target = $("ns-spot");
    if (!calcOut || !target) return;
    const raw = (calcOut.textContent || "").trim();
    const n = Number(raw);
    if (raw && raw !== "—" && isFinite(n)) {
      target.value = n;
    }
  }

  function closeOverlay() {
    overlay.hidden = true;
    document.body.style.overflow = "";
    state.editingId = null;
    setOverlayMode("create");
  }

  $("new-specimen-btn").addEventListener("click", openOverlay);
  $("overlay-close-btn").addEventListener("click", closeOverlay);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!overlay.hidden) closeOverlay();
      if (!$("detail-modal").hidden) closeDetail();
    }
  });

  // Beam expander toggle (mirror calculator's pattern)
  $("ns-expander-toggle").addEventListener("click", () => {
    state.expanderOn = !state.expanderOn;
    syncExpanderVisual();
  });

  // Image drop zone
  const drop = $("image-drop");
  const fileInput = $("image-input");

  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag-over");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleImageFile(f);
  });

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) handleImageFile(f);
  });

  function handleImageFile(file) {
    if (!/^image\//.test(file.type)) {
      alert("Please select an image file.");
      return;
    }
    state.selectedImage = file;
    const url = URL.createObjectURL(file);
    const preview = $("image-preview");
    preview.style.backgroundImage = `url("${url}")`;
    preview.hidden = false;
  }

  // Test type management
  $("ns-gear").addEventListener("click", () => {
    $("type-manager").classList.toggle("hidden");
  });

  $("add-type-btn").addEventListener("click", async () => {
    const input = $("new-type-input");
    const name = input.value.trim();
    if (!name) return;
    const res = await fetch("/experiments/test-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      input.value = "";
      await fetchTypes();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(`Add failed: ${err.error || res.statusText}`);
    }
  });

  // Preview
  $("preview-btn").addEventListener("click", async () => {
    const payload = collectNumericPayload();
    const res = await fetch("/experiments/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const out = $("preview-result");
    if (!res.ok) {
      out.innerHTML = `<span class="error" style="border:none;padding:0;background:none;">${data.error}</span>`;
      return;
    }
    const fl = data.fluence != null ? `<strong>${fmt(data.fluence, 2)}</strong> J/mm²` : "—";
    const ve = data.ved != null ? `<strong>${fmt(data.ved, 1)}</strong> J/mm³` : "—";
    out.innerHTML = `Fluence: ${fl}  ·  VED: ${ve}`;
  });

  function collectNumericPayload() {
    return {
      power: $("ns-power").value,
      scan_speed: $("ns-speed").value,
      spot_diameter: $("ns-spot").value,
      hatch_distance: $("ns-hatch").value,
      layer_thickness: $("ns-layer").value,
    };
  }

  // Save
  $("save-specimen-btn").addEventListener("click", async () => {
    const err = $("overlay-error");
    err.classList.add("hidden");
    const fd = new FormData();
    fd.append("specimen_label", $("ns-label").value);
    fd.append("test_type", $("ns-test-type").value);
    fd.append("galvo_scanner", $("ns-galvo").value);
    fd.append("f_theta_lens", $("ns-lens").value);
    fd.append("laser_diode", $("ns-diode").value);
    fd.append("beam_expander", state.expanderOn ? "1" : "0");
    fd.append("beam_expander_model", $("ns-expander-model").value);
    fd.append("power", $("ns-power").value);
    fd.append("scan_speed", $("ns-speed").value);
    fd.append("spot_diameter", $("ns-spot").value);
    fd.append("hatch_distance", $("ns-hatch").value);
    fd.append("layer_thickness", $("ns-layer").value);
    fd.append("scan_strategy", $("ns-strategy").value);
    fd.append("notes", $("ns-notes").value);
    if (state.selectedImage && !state.editingId) fd.append("image", state.selectedImage);

    const url = state.editingId
      ? `/experiments/${state.editingId}/update`
      : "/experiments";
    const res = await fetch(url, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.error || `Save failed (${res.status})`;
      err.classList.remove("hidden");
      return;
    }

    if (state.editingId) {
      const idx = state.rows.findIndex((r) => r.id === state.editingId);
      if (idx !== -1) state.rows[idx] = data;
    } else {
      state.rows.unshift(data);
    }
    renderGrid();
    await fetchOptions();
    clearSpecimenForm();

    closeOverlay();
  });

  // ============================================================
  // Detail modal
  // ============================================================
  const modal = $("detail-modal");
  const modalBody = $("modal-body");

  function openDetail(row) {
    modalBody.innerHTML = renderDetailHtml(row);
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const saveBtn = $("edit-notes-save");
    if (saveBtn) saveBtn.addEventListener("click", () => saveNotes(row.id));
    const editBtn = $("modal-edit-btn");
    if (editBtn) editBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDetail();
      openEditOverlay(row);
    });
    const delBtn = $("modal-delete-btn");
    if (delBtn) delBtn.addEventListener("click", () => deleteSpecimen(row));
  }

  async function deleteSpecimen(row) {
    const label = row.specimen_label || `#${row.id}`;
    if (!confirm(`Delete specimen "${label}"? This cannot be undone.`)) return;
    const res = await fetch(`/experiments/${row.id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || `Delete failed (${res.status})`);
      return;
    }
    state.rows = state.rows.filter((r) => r.id !== row.id);
    renderGrid();
    closeDetail();
    fetchOptions();
  }

  async function saveNotes(rowId) {
    const textarea = $("edit-notes-textarea");
    const status = $("edit-notes-status");
    const btn = $("edit-notes-save");
    if (!textarea || !btn) return;
    if (rowId === undefined || rowId === null) {
      status.textContent = "Save failed: missing row id";
      status.classList.add("error-text");
      console.error("saveNotes: missing rowId", rowId);
      return;
    }
    const notes = textarea.value;
    btn.disabled = true;
    status.textContent = "Saving…";
    status.classList.remove("error-text");
    const url = `/experiments/${rowId}/notes`;
    console.log("saveNotes POST", url, { notes });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    btn.disabled = false;
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("saveNotes failed", res.status, data);
      status.textContent = data.error || `Save failed (${res.status})`;
      status.classList.add("error-text");
      return;
    }
    const updated = await res.json();
    const idx = state.rows.findIndex((r) => r.id === rowId);
    if (idx !== -1) state.rows[idx] = updated;
    renderGrid();
    status.textContent = "Saved";
    setTimeout(() => { if (status.textContent === "Saved") status.textContent = ""; }, 2000);
  }

  function closeDetail() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDetail();
  });
  $("modal-close-btn").addEventListener("click", closeDetail);

  function detailRow(label, value, unit) {
    if (value === null || value === undefined || value === "") return "";
    const v = unit ? `${value} ${unit}` : value;
    return `<div class="modal-row"><div class="label">${label}</div><div class="value">${v}</div></div>`;
  }

  function renderDetailHtml(row) {
    const imgStyle = row.image_path
      ? `background-image: url("${row.image_path}")`
      : "";
    const placeholder = row.image_path ? "" : " placeholder";
    const flu = row.fluence != null ? `${fmt(row.fluence, 2)} J/mm²` : "—";
    const ved = row.ved != null ? `${fmt(row.ved, 1)} J/mm³` : "—";

    return `
      <h2>${escapeHtml(row.specimen_label || "(unlabeled)")}</h2>
      <div class="exp-image modal-image${placeholder}" style="${imgStyle}">
        ${row.test_type ? `<span class="exp-badge">${escapeHtml(row.test_type)}</span>` : ""}
        <button type="button" class="exp-edit-btn" id="modal-edit-btn">Edit</button>
      </div>
      <div class="modal-metrics">
        <div class="modal-metric"><div class="label">Fluence</div><div class="value">${flu}</div></div>
        <div class="modal-metric"><div class="label">VED</div><div class="value">${ved}</div></div>
      </div>
      <div class="modal-section-title">Parameters</div>
      <div class="modal-grid">
        ${detailRow("Power", row.power, "W")}
        ${detailRow("Scan Speed", row.scan_speed, "mm/s")}
        ${detailRow("Spot Diameter", row.spot_diameter, "µm")}
        ${detailRow("Hatch Distance", row.hatch_distance, "µm")}
        ${detailRow("Layer Thickness", row.layer_thickness, "µm")}
        ${detailRow("Scan Strategy", row.scan_strategy)}
        ${detailRow("Date", formatDate(row.created_at))}
        ${detailRow("Test Type", row.test_type)}
      </div>
      <div class="modal-section-title">Equipment</div>
      <div class="modal-grid">
        ${detailRow("Galvo Scanner", row.galvo_scanner)}
        ${detailRow("F-Theta Lens", row.f_theta_lens)}
        ${detailRow("Laser Diode", row.laser_diode)}
        ${detailRow("Beam Expander", row.beam_expander ? "On" : "Off")}
        ${row.beam_expander && row.beam_expander_model ? detailRow("Expander Model", row.beam_expander_model) : ""}
      </div>
      <div class="modal-section-title">Notes</div>
      <textarea class="modal-notes-edit" id="edit-notes-textarea" rows="5">${escapeHtml(row.notes || "")}</textarea>
      <div class="modal-notes-actions">
        <button type="button" class="primary" id="edit-notes-save" data-id="${row.id}">Save Notes</button>
        <span class="modal-notes-status" id="edit-notes-status"></span>
      </div>
      <div class="modal-danger-actions">
        <button type="button" class="modal-delete-btn" id="modal-delete-btn">Delete Specimen</button>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // ============================================================
  // Refresh data when entering Experiments tab
  // ============================================================
  document.querySelectorAll('.page-tab[data-page="experiments"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      fetchTypes();
      fetchOptions();
      fetchEquipment();
      loadExperiments({});
    });
  });

  // ============================================================
  // Init
  // ============================================================
  fetchTypes();
  fetchOptions();
  fetchEquipment();
  loadExperiments({});
})();
