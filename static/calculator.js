(function () {
  "use strict";

  // ============================================================
  // State
  // ============================================================
  const state = {
    galvo: [],
    lens: [],
    expander: [],
    expanderOn: false,
  };

  const TABLE_COLUMNS = {
    galvo: [
      ["manufacturer", "Manufacturer"],
      ["model_number", "Model"],
      ["input_aperture_mm", "Aperture (mm)"],
      ["optimized_wavelength_nm", "λ (nm)"],
      ["full_mechanical_angle_deg", "Mech. ∠ (°)"],
      ["full_optical_angle_deg", "Optical ∠ (°)"],
      ["notes", "Notes"],
    ],
    lens: [
      ["manufacturer", "Manufacturer"],
      ["model_number", "Model"],
      ["focal_length_mm", "f (mm)"],
      ["working_distance_mm", "WD (mm)"],
      ["field_size_mm", "Field (mm)"],
      ["optimized_wavelength_nm", "λ (nm)"],
      ["input_aperture_mm", "Aperture (mm)"],
      ["notes", "Notes"],
    ],
    expander: [
      ["manufacturer", "Manufacturer"],
      ["model_number", "Model"],
      ["magnification", "M"],
      ["input_beam_diameter_mm", "Input Ø (mm)"],
      ["output_beam_diameter_mm", "Output Ø (mm)"],
      ["optimized_wavelength_nm", "λ (nm)"],
      ["notes", "Notes"],
    ],
  };

  // ============================================================
  // Page-level tab routing
  // ============================================================
  document.querySelectorAll(".page-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".page-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.page;
      document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
      document.getElementById(`page-${target}`).classList.remove("hidden");
    });
  });

  // ============================================================
  // Equipment-tab routing (within Equipment Database page)
  // ============================================================
  document.querySelectorAll(".sub-tab[data-eq-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.eqTab;
      document.querySelectorAll(".sub-tab[data-eq-tab]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".eq-pane").forEach((pane) => {
        pane.classList.toggle("hidden", pane.dataset.eqPane !== target);
      });
    });
  });

  // ============================================================
  // Equipment data: load, render, mutate
  // ============================================================
  async function fetchAll() {
    const [galvo, lens, expander] = await Promise.all([
      fetch("/equipment/galvo").then((r) => r.json()),
      fetch("/equipment/lens").then((r) => r.json()),
      fetch("/equipment/expander").then((r) => r.json()),
    ]);
    state.galvo = galvo;
    state.lens = lens;
    state.expander = expander;
    renderDropdowns();
    renderTables();
  }

  function renderDropdowns() {
    const galvoSel = document.getElementById("galvo-select");
    const lensSel = document.getElementById("lens-select");

    function fill(sel, rows, formatter) {
      const prev = sel.value;
      sel.innerHTML = "";
      if (rows.length === 0) {
        const opt = document.createElement("option");
        opt.textContent = "— none available —";
        opt.value = "";
        sel.appendChild(opt);
        return;
      }
      rows.forEach((row) => {
        const opt = document.createElement("option");
        opt.value = row.id;
        opt.textContent = formatter(row);
        sel.appendChild(opt);
      });
      if (prev && rows.some((r) => String(r.id) === prev)) sel.value = prev;
    }

    fill(galvoSel, state.galvo, (r) => `${r.manufacturer} ${r.model_number}`);
    fill(lensSel, state.lens, (r) => `${r.manufacturer} ${r.model_number} (f=${r.focal_length_mm}mm)`);

    updateWorkingDistanceWarning();
    runCalculation();
  }

  function renderTables() {
    ["galvo", "lens", "expander"].forEach((kind) => {
      const tbl = document.getElementById(`table-${kind}`);
      const cols = TABLE_COLUMNS[kind];
      const rows = state[kind];

      let html = "<thead><tr>";
      cols.forEach(([, label]) => (html += `<th>${label}</th>`));
      html += "<th></th></tr></thead><tbody>";
      if (rows.length === 0) {
        html += `<tr><td colspan="${cols.length + 1}" style="opacity:0.6;font-style:italic;">No entries yet.</td></tr>`;
      } else {
        rows.forEach((row) => {
          html += "<tr>";
          cols.forEach(([key]) => {
            const val = row[key];
            const isEmpty = val === null || val === undefined || val === "";
            const display = isEmpty
              ? (key === "working_distance_mm" ? "—" : "")
              : String(val);
            html += `<td>${display}</td>`;
          });
          html += `<td class="row-actions"><button type="button" class="edit-btn" data-kind="${kind}" data-id="${row.id}">Edit</button><button type="button" class="delete-btn" data-kind="${kind}" data-id="${row.id}">Delete</button></td>`;
          html += "</tr>";
        });
      }
      html += "</tbody>";
      tbl.innerHTML = html;
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const { kind, id } = btn.dataset;
        if (!confirm("Delete this entry?")) return;
        await fetch(`/equipment/${kind}/${id}`, { method: "DELETE" });
        await fetchAll();
      });
    });

    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { kind, id } = btn.dataset;
        const row = state[kind].find((r) => String(r.id) === String(id));
        if (!row) return;
        const form = document.querySelector(`.eq-form[data-kind="${kind}"]`);
        setFormMode(form, "edit", row);
      });
    });
  }

  function setFormMode(form, mode, row) {
    const heading = form.querySelector("h3");
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!form.dataset.origHeading) {
      form.dataset.origHeading = heading.textContent;
      form.dataset.origSubmitText = submitBtn.textContent;
    }
    if (mode === "edit" && row) {
      form.dataset.editId = String(row.id);
      heading.textContent = form.dataset.origHeading.replace(/^Add New /, "Edit ");
      submitBtn.textContent = "Save";
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        const v = row[el.name];
        el.value = v === null || v === undefined ? "" : String(v);
      });
      let cancelBtn = form.querySelector(".eq-cancel-btn");
      if (!cancelBtn) {
        cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "eq-cancel-btn";
        cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", () => setFormMode(form, "add"));
        submitBtn.insertAdjacentElement("afterend", cancelBtn);
      }
      cancelBtn.classList.remove("hidden");
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      delete form.dataset.editId;
      form.reset();
      if (form.dataset.origHeading) heading.textContent = form.dataset.origHeading;
      if (form.dataset.origSubmitText) submitBtn.textContent = form.dataset.origSubmitText;
      const cancelBtn = form.querySelector(".eq-cancel-btn");
      if (cancelBtn) cancelBtn.classList.add("hidden");
    }
  }

  document.querySelectorAll(".eq-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const kind = form.dataset.kind;
      const data = {};
      Array.from(form.elements).forEach((el) => {
        if (!el.name) return;
        const v = el.value;
        if (v === "") {
          data[el.name] = null;
          return;
        }
        data[el.name] = el.type === "number" ? Number(v) : v;
      });

      const editId = form.dataset.editId;
      const url = editId ? `/equipment/${kind}/${editId}` : `/equipment/${kind}`;
      const method = editId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        alert(`${editId ? "Save" : "Add"} failed: ${err.error || res.statusText}`);
        return;
      }
      setFormMode(form, "add");
      await fetchAll();
    });
  });

  // ============================================================
  // Calculator
  // ============================================================
  const inputs = {
    z: document.getElementById("z-height"),
    galvo: document.getElementById("galvo-select"),
    lens: document.getElementById("lens-select"),
    magnification: document.getElementById("magnification"),
    laserDiameter: document.getElementById("laser-diameter"),
  };

  const out = {
    w0: document.getElementById("out-w0"),
    zr: document.getElementById("out-zr"),
    wz: document.getElementById("out-wz"),
    spot: document.getElementById("out-spot"),
    dof: document.getElementById("out-dof"),
    err: document.getElementById("calc-error"),
    mismatch: document.getElementById("mismatch-warning"),
    workingDistance: document.getElementById("working-distance-warning"),
    apertureHint: document.getElementById("aperture-hint"),
  };

  function updateWorkingDistanceWarning() {
    const lensId = inputs.lens.value;
    if (!lensId) {
      out.workingDistance.classList.add("hidden");
      return;
    }
    const lens = state.lens.find((r) => String(r.id) === String(lensId));
    const wd = lens && lens.working_distance_mm;
    const missing = wd === null || wd === undefined || wd === "";
    out.workingDistance.classList.toggle("hidden", !missing);
  }

  const expanderToggle = document.getElementById("expander-toggle");
  const expanderFields = document.getElementById("expander-fields");

  expanderToggle.addEventListener("click", () => {
    state.expanderOn = !state.expanderOn;
    expanderToggle.classList.toggle("on", state.expanderOn);
    expanderToggle.classList.toggle("off", !state.expanderOn);
    expanderToggle.setAttribute("aria-pressed", String(state.expanderOn));
    expanderToggle.querySelector(".toggle-mark").textContent = state.expanderOn ? "✓" : "✕";
    expanderToggle.querySelector(".toggle-label").textContent = state.expanderOn ? "On" : "Off";
    expanderFields.classList.toggle("collapsed", !state.expanderOn);
    out.apertureHint.classList.toggle("hidden", state.expanderOn);
    runCalculation();
  });

  let calcTimer = null;
  function scheduleCalc() {
    clearTimeout(calcTimer);
    calcTimer = setTimeout(runCalculation, 50);
  }

  [inputs.z, inputs.galvo, inputs.lens, inputs.magnification, inputs.laserDiameter]
    .forEach((el) => {
      el.addEventListener("input", scheduleCalc);
      el.addEventListener("change", scheduleCalc);
    });

  inputs.lens.addEventListener("change", updateWorkingDistanceWarning);

  function fmt(value, digits) {
    if (value === null || value === undefined || !isFinite(value)) return "—";
    if (Math.abs(value) >= 1000) return value.toFixed(0);
    return value.toFixed(digits);
  }

  function clearOutputs() {
    out.w0.textContent = "—";
    out.zr.textContent = "—";
    out.wz.textContent = "—";
    out.spot.textContent = "—";
    out.dof.textContent = "—";
    recomputeFluence();
  }

  async function runCalculation() {
    if (!inputs.galvo.value || !inputs.lens.value) {
      clearOutputs();
      out.err.classList.add("hidden");
      out.mismatch.classList.add("hidden");
      return;
    }

    const payload = {
      z_height_mm: Number(inputs.z.value),
      galvo_id: Number(inputs.galvo.value),
      lens_id: Number(inputs.lens.value),
      expander_on: state.expanderOn,
    };
    if (state.expanderOn) {
      payload.magnification = Number(inputs.magnification.value);
      payload.laser_diameter_mm = Number(inputs.laserDiameter.value);
    }

    try {
      const res = await fetch("/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        clearOutputs();
        out.err.textContent = data.error || "Calculation failed.";
        out.err.classList.remove("hidden");
        out.mismatch.classList.add("hidden");
        return;
      }
      out.err.classList.add("hidden");
      out.w0.textContent = fmt(data.w0_um, 2);
      out.zr.textContent = fmt(data.z_r_mm, 3);
      out.wz.textContent = fmt(data.wz_um, 2);
      out.spot.textContent = fmt(data.spot_diameter_um, 2);
      out.dof.textContent = fmt(data.depth_of_focus_mm, 3);
      recomputeFluence();
      if (data.mismatch_warning) {
        out.mismatch.textContent = data.mismatch_warning;
        out.mismatch.classList.remove("hidden");
      } else {
        out.mismatch.classList.add("hidden");
      }
    } catch (e) {
      clearOutputs();
      out.err.textContent = "Could not reach server.";
      out.err.classList.remove("hidden");
    }
  }

  // ============================================================
  // Fluence / VED calculator panel
  // ============================================================
  function fmtNum(n, digits) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    if (Math.abs(n) >= 1000) return Number(n).toFixed(0);
    return Number(n).toFixed(digits);
  }

  function getSpotDiameterUm() {
    const txt = (document.getElementById("out-spot")?.textContent || "").trim();
    const n = Number(txt);
    return txt && txt !== "—" && isFinite(n) && n > 0 ? n : null;
  }

  function recomputeFluence() {
    const power = Number(document.getElementById("fl-power").value);
    const speed = Number(document.getElementById("fl-speed").value);
    const hatchUm = Number(document.getElementById("fl-hatch").value);
    const layerUm = Number(document.getElementById("fl-layer").value);
    const spotUm = getSpotDiameterUm();

    const flOut = document.getElementById("fl-out-fluence");
    const vedOut = document.getElementById("fl-out-ved");
    const hint = document.getElementById("fl-spot-hint");
    const err = document.getElementById("fl-error");
    err.classList.add("hidden");

    hint.textContent = spotUm
      ? `Using Spot Diameter from above: ${fmtNum(spotUm, 2)} µm`
      : "Run the calculator above to set Spot Diameter — fluence requires it.";

    if (!isFinite(power) || power <= 0 || !isFinite(speed) || speed <= 0) {
      flOut.textContent = "—";
      vedOut.textContent = "—";
      return;
    }

    if (spotUm) {
      const spotRadiusMm = (spotUm / 1000) / 2;
      const fluence = power / (speed * Math.PI * spotRadiusMm * spotRadiusMm);
      flOut.textContent = fmtNum(fluence, 2);
    } else {
      flOut.textContent = "—";
    }

    if (isFinite(hatchUm) && hatchUm > 0 && isFinite(layerUm) && layerUm > 0) {
      const hatchMm = hatchUm / 1000;
      const layerMm = layerUm / 1000;
      const ved = power / (speed * hatchMm * layerMm);
      vedOut.textContent = fmtNum(ved, 1);
    } else {
      vedOut.textContent = "—";
    }
  }

  document.querySelectorAll(".fluence-panel input").forEach((inp) => {
    inp.addEventListener("input", recomputeFluence);
  });
  document.querySelectorAll(".fluence-panel .nudge-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const field = btn.closest(".nudge-field");
      const input = field.querySelector("input");
      const step = Number(field.dataset.step) || Number(input.step) || 1;
      const dir = Number(btn.dataset.dir) || 1;
      const cur = Number(input.value);
      const next = (isFinite(cur) ? cur : 0) + dir * step;
      const min = input.min !== "" ? Number(input.min) : -Infinity;
      input.value = Math.max(min, next);
      recomputeFluence();
    });
  });
  // Initial render
  recomputeFluence();

  // ============================================================
  // F-Theta Lens reference sheets (uploaded spec-table images)
  // ============================================================
  const lensRefForm = document.getElementById("lens-ref-form");
  const lensRefFile = document.getElementById("lens-ref-file");
  const lensRefGrid = document.getElementById("lens-ref-grid");

  async function fetchLensReferences() {
    if (!lensRefGrid) return;
    try {
      const res = await fetch("/lens-references");
      const rows = await res.json();
      renderLensReferences(rows);
    } catch (e) {
      lensRefGrid.innerHTML = '<div class="hint italic">Could not load reference sheets.</div>';
    }
  }

  function renderLensReferences(rows) {
    if (!rows.length) {
      lensRefGrid.innerHTML = '<div class="hint italic">No reference sheets uploaded yet.</div>';
      return;
    }
    lensRefGrid.innerHTML = rows.map((r) => `
      <div class="lens-ref-card">
        <a href="${r.url}" target="_blank" rel="noopener">
          <img src="${r.url}" alt="${escapeHtml(r.original_filename)}">
        </a>
        <div class="lens-ref-meta">
          <span class="lens-ref-name" title="${escapeHtml(r.original_filename)}">${escapeHtml(r.original_filename)}</span>
          <button type="button" class="lens-ref-delete" data-id="${r.id}">Delete</button>
        </div>
      </div>
    `).join("");

    lensRefGrid.querySelectorAll(".lens-ref-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this reference sheet?")) return;
        await fetch(`/lens-references/${btn.dataset.id}`, { method: "DELETE" });
        fetchLensReferences();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  if (lensRefForm) {
    lensRefForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!lensRefFile.files.length) return;
      const fd = new FormData();
      fd.append("image", lensRefFile.files[0]);
      const res = await fetch("/lens-references", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        alert(`Upload failed: ${err.error || res.statusText}`);
        return;
      }
      lensRefForm.reset();
      fetchLensReferences();
    });
  }

  // ============================================================
  // Version tag
  // ============================================================
  async function fetchVersion() {
    const tag = document.getElementById("version-tag");
    if (!tag) return;
    try {
      const res = await fetch("/version");
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      tag.textContent = `v${data.version}`;
    } catch {
      tag.textContent = "v?";
    }
  }

  // ============================================================
  // Boot
  // ============================================================
  fetchAll();
  fetchVersion();
  fetchLensReferences();
})();
