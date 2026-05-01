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
            html += `<td>${val === null || val === undefined ? "" : String(val)}</td>`;
          });
          html += `<td><button type="button" class="delete-btn" data-kind="${kind}" data-id="${row.id}">Delete</button></td>`;
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
  }

  document.querySelectorAll(".eq-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const kind = form.dataset.kind;
      const data = {};
      new FormData(form).forEach((v, k) => {
        if (v === "" || v === null) return;
        data[k] = isNaN(Number(v)) || k === "manufacturer" || k === "model_number" || k === "notes"
          ? v
          : Number(v);
      });
      // Numeric fields: coerce explicitly
      ["input_aperture_mm", "optimized_wavelength_nm", "full_mechanical_angle_deg",
       "full_optical_angle_deg", "focal_length_mm", "field_size_mm",
       "magnification", "input_beam_diameter_mm", "output_beam_diameter_mm"]
        .forEach((k) => { if (data[k] !== undefined) data[k] = Number(data[k]); });

      const res = await fetch(`/equipment/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        alert(`Add failed: ${err.error || res.statusText}`);
        return;
      }
      form.reset();
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
    apertureHint: document.getElementById("aperture-hint"),
  };

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
})();
