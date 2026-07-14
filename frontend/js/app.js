// ---------------------------------------------------------
// Vendor Intelligence — frontend logic
// Talks to the FastAPI backend running at API_BASE_URL.
// If you serve the frontend from the FastAPI app itself
// (http://localhost:8000/), the relative "" base works as-is.
// If you open index.html directly as a file, set API_BASE_URL
// to "http://localhost:8000".
// ---------------------------------------------------------

const API_BASE_URL = window.location.port === "8000" ? "" : "http://localhost:8000";

const invoiceForm = document.getElementById("invoiceForm");
const invoiceResult = document.getElementById("invoiceResult");

const freightForm = document.getElementById("freightForm");
const freightResult = document.getElementById("freightResult");

const refreshBtn = document.getElementById("refreshHistory");

// ---------- helpers ----------

function money(value) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function timestamp(value) {
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function setButtonLoading(form, isLoading, loadingText) {
  const btn = form.querySelector("button[type=submit]");
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span>${loadingText}</span>`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = false;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

// ---------- health check ----------

async function checkHealth() {
  const dot = document.getElementById("apiDot");
  const text = document.getElementById("apiStatusText");
  try {
    await apiRequest("/api/health");
    dot.className = "dot online";
    text.textContent = "Connected to desk API";
  } catch (err) {
    dot.className = "dot offline";
    text.textContent = "API unreachable — is uvicorn running?";
  }
}

// ---------- invoice risk ----------

invoiceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(invoiceForm);
  const payload = {
    invoice_quantity: Number(formData.get("invoice_quantity")),
    invoice_dollars: Number(formData.get("invoice_dollars")),
    Freight: Number(formData.get("Freight")),
    total_item_quantity: Number(formData.get("total_item_quantity")),
    total_item_dollars: Number(formData.get("total_item_dollars")),
  };

  setButtonLoading(invoiceForm, true, "Stamping…");
  invoiceResult.innerHTML = "";

  try {
    const result = await apiRequest("/api/invoice/predict", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const isFlagged = result.predicted_flag === 1;
    invoiceResult.innerHTML = `
      <div class="stamp ${isFlagged ? "flagged" : "cleared"}">
        ${isFlagged ? "Flagged" : "Cleared"}
        <small>confidence ${(result.risk_probability * 100).toFixed(1)}% &middot; entry #${result.id}</small>
      </div>
    `;
    loadInvoiceHistory();
  } catch (err) {
    invoiceResult.innerHTML = `<p class="error-note">Could not score this invoice: ${err.message}</p>`;
  } finally {
    setButtonLoading(invoiceForm, false);
  }
});

// ---------- freight cost ----------

freightForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(freightForm);
  const payload = { Dollars: Number(formData.get("Dollars")) };

  setButtonLoading(freightForm, true, "Estimating…");
  freightResult.innerHTML = "";

  try {
    const result = await apiRequest("/api/freight/predict", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    freightResult.innerHTML = `
      <div class="freight-readout">
        <span class="figure">$${money(result.predicted_freight)}</span>
        <span class="label">projected freight &middot; entry #${result.id}</span>
      </div>
    `;
    loadFreightHistory();
  } catch (err) {
    freightResult.innerHTML = `<p class="error-note">Could not estimate freight: ${err.message}</p>`;
  } finally {
    setButtonLoading(freightForm, false);
  }
});

// ---------- history tables ----------

async function loadInvoiceHistory() {
  const tbody = document.querySelector("#invoiceHistoryTable tbody");
  const empty = document.getElementById("invoiceHistoryEmpty");
  try {
    const rows = await apiRequest("/api/invoice/history?limit=20");
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.id}</td>
        <td>$${money(r.invoice_dollars)}</td>
        <td>$${money(r.freight)}</td>
        <td><span class="verdict-tag ${r.risk_label === "FLAGGED" ? "flagged" : "cleared"}">${r.risk_label}</span></td>
        <td>${(r.risk_probability * 100).toFixed(1)}%</td>
        <td>${timestamp(r.created_at)}</td>
      </tr>
    `).join("");
    empty.style.display = rows.length ? "none" : "block";
  } catch (err) {
    empty.textContent = `Could not load history: ${err.message}`;
    empty.style.display = "block";
  }
}

async function loadFreightHistory() {
  const tbody = document.querySelector("#freightHistoryTable tbody");
  const empty = document.getElementById("freightHistoryEmpty");
  try {
    const rows = await apiRequest("/api/freight/history?limit=20");
    tbody.innerHTML = rows.map((r) => `
      <tr>
        <td>${r.id}</td>
        <td>$${money(r.dollars)}</td>
        <td>$${money(r.predicted_freight)}</td>
        <td>${timestamp(r.created_at)}</td>
      </tr>
    `).join("");
    empty.style.display = rows.length ? "none" : "block";
  } catch (err) {
    empty.textContent = `Could not load history: ${err.message}`;
    empty.style.display = "block";
  }
}

refreshBtn.addEventListener("click", () => {
  loadInvoiceHistory();
  loadFreightHistory();
});

// ---------- init ----------

checkHealth();
loadInvoiceHistory();
loadFreightHistory();
