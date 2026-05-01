(function () {
  const $ = (id) => document.getElementById(id);
  const state = { rows: [] };

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function fmtNum(n) {
    if (n === null || n === undefined) return "";
    const v = Number(n);
    if (!isFinite(v)) return "";
    return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
  }

  function dimsText(row) {
    if (row.shape === "square") return `${fmtNum(row.dim_a)} × ${fmtNum(row.dim_a)} mm`;
    if (row.shape === "rectangle") return `${fmtNum(row.dim_a)} × ${fmtNum(row.dim_b)} mm`;
    if (row.shape === "circle") return `r = ${fmtNum(row.dim_a)} mm`;
    return "";
  }

  function shapeSvg(row) {
    const W = 200, H = 150, PAD = 14;
    if (row.shape === "circle") {
      const r = (Math.min(W, H) - PAD * 2) / 2;
      return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><circle class="outline" cx="${W / 2}" cy="${H / 2}" r="${r}"/></svg>`;
    }
    let aspect = 1;
    if (row.shape === "rectangle" && row.dim_a > 0 && row.dim_b > 0) {
      aspect = row.dim_a / row.dim_b;
    }
    const maxW = W - PAD * 2;
    const maxH = H - PAD * 2;
    let rectW = maxW, rectH = maxH;
    if (aspect >= maxW / maxH) {
      rectW = maxW;
      rectH = rectW / aspect;
    } else {
      rectH = maxH;
      rectW = rectH * aspect;
    }
    const x = (W - rectW) / 2;
    const y = (H - rectH) / 2;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect class="outline" x="${x}" y="${y}" width="${rectW}" height="${rectH}"/></svg>`;
  }

  function buildCard(row) {
    const card = document.createElement("div");
    card.className = "st-card";
    card.dataset.id = row.id;

    const hasFile = !!row.beamp_filename;
    const notesHtml = row.notes
      ? `<div class="st-notes">${escapeHtml(row.notes)}</div>`
      : "";

    card.innerHTML = `
      <h3>${escapeHtml(row.name)}</h3>
      <div class="st-shape-preview">${shapeSvg(row)}</div>
      <div class="st-dims">${escapeHtml(dimsText(row))}</div>
      ${notesHtml}
      <div class="st-actions">
        <button type="button" class="st-download-btn"${hasFile ? "" : " disabled"}>Download .BEAMP</button>
        <button type="button" class="st-delete-btn">Delete</button>
      </div>
    `;

    card.querySelector(".st-download-btn").addEventListener("click", () => {
      if (!hasFile) return;
      window.location = `/substrate-templates/${row.id}/download`;
    });
    card.querySelector(".st-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete template "${row.name}"?`)) return;
      const res = await fetch(`/substrate-templates/${row.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        alert("Delete failed");
        return;
      }
      await fetchTemplates();
    });

    return card;
  }

  function renderGrid() {
    const grid = $("st-grid");
    grid.innerHTML = "";
    if (state.rows.length === 0) {
      $("st-empty").classList.remove("hidden");
      return;
    }
    $("st-empty").classList.add("hidden");
    state.rows.forEach((row) => grid.appendChild(buildCard(row)));
  }

  async function fetchTemplates() {
    const res = await fetch("/substrate-templates");
    state.rows = res.ok ? await res.json() : [];
    renderGrid();
  }

  function showShapeFields(shape) {
    document.querySelectorAll(".st-shape-fields").forEach((el) => el.classList.add("hidden"));
    const target = $(`st-fields-${shape}`);
    if (target) target.classList.remove("hidden");
  }

  function resetForm() {
    $("st-name").value = "";
    $("st-shape").value = "square";
    showShapeFields("square");
    $("st-side").value = "";
    $("st-width").value = "";
    $("st-height").value = "";
    $("st-radius").value = "";
    $("st-notes").value = "";
    $("st-beamp").value = "";
    $("st-error").classList.add("hidden");
    $("st-error").textContent = "";
  }

  function openForm() {
    resetForm();
    $("st-form-panel").classList.remove("hidden");
    $("st-name").focus();
  }

  function closeForm() {
    $("st-form-panel").classList.add("hidden");
  }

  async function saveTemplate() {
    const err = $("st-error");
    err.classList.add("hidden");
    err.textContent = "";

    const name = $("st-name").value.trim();
    const shape = $("st-shape").value;
    if (!name) {
      err.textContent = "Name is required.";
      err.classList.remove("hidden");
      return;
    }

    const fd = new FormData();
    fd.append("name", name);
    fd.append("shape", shape);

    if (shape === "square") {
      const side = $("st-side").value;
      if (!side || Number(side) <= 0) {
        err.textContent = "Side length is required.";
        err.classList.remove("hidden");
        return;
      }
      fd.append("dim_a", side);
    } else if (shape === "rectangle") {
      const w = $("st-width").value;
      const h = $("st-height").value;
      if (!w || Number(w) <= 0 || !h || Number(h) <= 0) {
        err.textContent = "Width and height are required.";
        err.classList.remove("hidden");
        return;
      }
      fd.append("dim_a", w);
      fd.append("dim_b", h);
    } else if (shape === "circle") {
      const r = $("st-radius").value;
      if (!r || Number(r) <= 0) {
        err.textContent = "Radius is required.";
        err.classList.remove("hidden");
        return;
      }
      fd.append("dim_a", r);
    }

    const notes = $("st-notes").value.trim();
    if (notes) fd.append("notes", notes);

    const beampFile = $("st-beamp").files && $("st-beamp").files[0];
    if (beampFile) fd.append("beamp", beampFile);

    const res = await fetch("/substrate-templates", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      err.textContent = data.error || `Save failed (${res.status})`;
      err.classList.remove("hidden");
      return;
    }

    state.rows.push(data);
    renderGrid();
    closeForm();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!$("st-grid")) return;

    $("new-template-btn").addEventListener("click", openForm);
    $("st-cancel-btn").addEventListener("click", closeForm);
    $("st-save-btn").addEventListener("click", saveTemplate);
    $("st-shape").addEventListener("change", (e) => showShapeFields(e.target.value));

    fetchTemplates();
  });
})();
