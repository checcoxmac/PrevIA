/* BizManager Pro v2
   - Movimenti + Lavori + Incassi + Preventivi + Storico Prodotti
   - Mobile-first, 4 main tabs: Home, Lavori, Preventivi, Storico
*/

"use strict";

const STORAGE_KEY = "bizmanagerpro_state_v2";
const formatMoney = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

const $ = (sel) => document.querySelector(sel);

// STORAGE SAFE WRAPPER (fallback to memory if blocked)
const memoryStore = {};
let storageDisabled = false;

const safeStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      storageDisabled = true;
      return memoryStore[key] ?? null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      storageDisabled = true;
      memoryStore[key] = value;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      storageDisabled = true;
      delete memoryStore[key];
    }
  }
};

// UTILITIES
function nowISO() { return new Date().toISOString(); }
function toISODateOnly(d = new Date()) {
  const dt = new Date(d);
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, "0"), day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function safeUpper(s) { return String(s ?? "").trim().toUpperCase(); }
function safeTrim(s) { return String(s ?? "").trim(); }
function parseImporto(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; }
function localeSortIT(a, b) { return a.localeCompare(b, "it", { sensitivity: "base" }); }
function uniq(arr) { return Array.from(new Set(arr)); }
function fmtShortDate(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("it-IT"); }
function fmtDayMonth(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }); }
function escapeHTML(str) { return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }

// STATE MANAGEMENT
function loadState() {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);

    const st = {
      version: 2,
      companyName: String(parsed.companyName ?? "La tua ditta").trim() || "La tua ditta",
      companyLogoDataUrl: parsed.companyLogoDataUrl || null,
      companyInfo: {
        address: safeTrim(parsed.companyInfo?.address || ""),
        piva: safeTrim(parsed.companyInfo?.piva || ""),
        phone: safeTrim(parsed.companyInfo?.phone || ""),
        email: safeTrim(parsed.companyInfo?.email || "")
      },
      quoteCounter: Number(parsed.quoteCounter) || 1,
      selectedQuoteId: Number(parsed.selectedQuoteId) || null,
      saldoIniziale: Number(parsed.saldoIniziale ?? 0) || 0,
      lastSyncISO: parsed.lastSyncISO ?? null,
      movimenti: Array.isArray(parsed.movimenti) ? parsed.movimenti : [],
      anagrafiche: {
        clienti: Array.isArray(parsed?.anagrafiche?.clienti) ? parsed.anagrafiche.clienti : [],
        fornitori: Array.isArray(parsed?.anagrafiche?.fornitori) ? parsed.anagrafiche.fornitori : [],
      },
      jobs: Array.isArray(parsed?.jobs) ? parsed.jobs : [],
      jobPayments: Array.isArray(parsed?.jobPayments) ? parsed.jobPayments : [],
      purchaseLines: Array.isArray(parsed?.purchaseLines) ? parsed.purchaseLines : [],
      quotes: Array.isArray(parsed?.quotes) ? parsed.quotes : [],
    };

    st.movimenti = st.movimenti
      .map((m) => ({
        id: Number(m.id) || Date.now(),
        dateISO: m.dateISO ? String(m.dateISO) : nowISO(),
        desc: safeTrim(m.desc),
        commessa: safeUpper(m.commessa),
        importo: Number(m.importo) || 0,
        tipo: m.tipo === "uscita" ? "uscita" : "entrata",
        controparteTipo: (m.controparteTipo === "fornitore" || m.controparteTipo === "altro") ? m.controparteTipo : "cliente",
        controparteNome: safeTrim(m.controparteNome),
      }))
      .filter((m) => m.desc && Number.isFinite(m.importo) && m.importo >= 0);

    st.anagrafiche.clienti = uniq(st.anagrafiche.clienti.map(safeTrim).filter(Boolean)).sort(localeSortIT);
    st.anagrafiche.fornitori = uniq(st.anagrafiche.fornitori.map(safeTrim).filter(Boolean)).sort(localeSortIT);

    st.jobs = (st.jobs || []).map(j => ({
      id: Number(j.id) || Date.now(),
      titolo: safeTrim(j.titolo),
      commessa: safeUpper(j.commessa),
      cliente: safeTrim(j.cliente),
      agreedTotal: Number(j.agreedTotal) || 0,
      stato: (j.stato === "chiuso") ? "chiuso" : "aperto",
      note: safeTrim(j.note),
      createdISO: j.createdISO ? String(j.createdISO) : nowISO(),
    })).filter(j => j.titolo && j.cliente && Number.isFinite(j.agreedTotal));

    st.jobPayments = (st.jobPayments || []).map(jp => ({
      id: Number(jp.id) || Date.now(),
      jobId: Number(jp.jobId) || 0,
      dateISO: jp.dateISO ? String(jp.dateISO) : nowISO(),
      amount: Number(jp.amount) || 0,
      method: safeTrim(jp.method) || "bonifico",
      note: safeTrim(jp.note),
    })).filter(jp => jp.jobId && jp.amount > 0);

    st.jobLines = (st.jobLines || []).map(jl => ({
      id: Number(jl.id) || Date.now(),
      jobId: Number(jl.jobId) || 0,
      kind: (jl.kind === "materiale" || jl.kind === "lavorazione") ? jl.kind : "materiale",
      desc: safeTrim(jl.desc),
      qty: Number(jl.qty) || 1,
      unit: safeTrim(jl.unit) || "pz",
      unitPrice: Number(jl.unitPrice) || 0,
      note: safeTrim(jl.note),
      done: Boolean(jl.done),
      createdISO: jl.createdISO ? String(jl.createdISO) : nowISO(),
    })).filter(jl => jl.jobId && jl.desc);

    st.purchaseLines = (st.purchaseLines || []).map(pl => ({
      id: Number(pl.id) || Date.now(),
      dateISO: pl.dateISO ? String(pl.dateISO) : nowISO(),
      fornitore: safeTrim(pl.fornitore),
      prodotto: safeTrim(pl.prodotto),
      qty: Number(pl.qty) || 1,
      unitPrice: Number(pl.unitPrice) || 0,
      commessa: safeUpper(pl.commessa),
      note: safeTrim(pl.note),
    })).filter(pl => pl.prodotto && pl.fornitore && Number.isFinite(pl.unitPrice));

    st.quotes = (st.quotes || []).map(q => {
      const righe = Array.isArray(q.righe) ? q.righe.map(r => {
        const qty = parseFloat(r.qty) || 1;
        const unitPrice = parseFloat(r.unitPrice) || 0;
        const sconto = parseFloat(r.sconto) || 0;
        const iva = parseFloat(r.iva) || 22;
        return {
          desc: safeTrim(r.desc),
          qty: qty,
          unitPrice: unitPrice,
          sconto: sconto,
          iva: iva,
        };
      }) : [];

      const totals = q.totals ? {
        taxable: parseFloat(q.totals.taxable) || 0,
        vat: parseFloat(q.totals.vat) || 0,
        total: parseFloat(q.totals.total) || 0,
      } : { taxable: 0, vat: 0, total: 0 };

      return {
        id: Number(q.id) || Date.now(),
        number: Number(q.number) || 0,
        dateISO: q.dateISO ? String(q.dateISO) : (q.createdISO ? String(q.createdISO) : nowISO()),
        cliente: safeTrim(q.cliente),
        commessa: safeUpper(q.commessa),
        status: (q.status === "locked" || q.stato === "confermato") ? "locked" : "draft",
        notes: safeTrim(q.notes || q.note || ""),
        righe: righe,
        totals: totals,
      };
    }).filter(q => q.cliente && q.commessa);

    return st;
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return {
    version: 2,
    companyName: "La tua ditta",
    companyLogoDataUrl: null,
    companyInfo: {
      address: "",
      piva: "",
      phone: "",
      email: ""
    },
    quoteCounter: 1,
    selectedQuoteId: null,
    saldoIniziale: 0,
    lastSyncISO: null,
    movimenti: [],
    anagrafiche: { clienti: [], fornitori: [] },
    jobs: [],
    jobPayments: [],
    jobLines: [],
    purchaseLines: [],
    quotes: [],
  };
}

function saveState() {
  safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// JOBS LOGIC
function getJobPaid(jobId) {
  return state.jobPayments.filter(jp => jp.jobId === jobId).reduce((acc, jp) => acc + jp.amount, 0);
}

function getJobDue(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return 0;
  const paid = getJobPaid(jobId);
  return Math.max(0, job.agreedTotal - paid);
}

function createJob(titolo, cliente, commessa, agreedTotal, note = "") {
  const job = {
    id: Date.now(),
    titolo: safeTrim(titolo),
    cliente: safeTrim(cliente),
    commessa: safeUpper(commessa),
    agreedTotal: parseImporto(agreedTotal),
    stato: "aperto",
    note: safeTrim(note),
    createdISO: nowISO(),
  };
  state.jobs.push(job);
  upsertAnagrafica("cliente", cliente);
  return job;
}

function createJobPayment(jobId, amount, method = "bonifico", note = "") {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return null;

  const jp = {
    id: Date.now(),
    jobId,
    dateISO: toISODateOnly() + "T12:00:00Z",
    amount: parseImporto(amount),
    method: safeTrim(method) || "bonifico",
    note: safeTrim(note),
  };

  state.jobPayments.push(jp);

  // Auto-create movimento entrata
  const mov = {
    id: Date.now() + 1,
    dateISO: jp.dateISO,
    desc: `Incasso ${job.titolo}`,
    commessa: job.commessa,
    importo: jp.amount,
    tipo: "entrata",
    controparteTipo: "cliente",
    controparteNome: job.cliente,
  };
  state.movimenti.push(mov);

  // Auto-close job if due <= 0
  const due = getJobDue(jobId);
  if (due <= 0) {
    job.stato = "chiuso";
  }

  return jp;
}

function updateJobNote(jobId, note) {
  const job = state.jobs.find(j => j.id === jobId);
  if (job) job.note = safeTrim(note);
}

function createJobLine(jobId, kind, desc, qty = 1, unit = "pz", unitPrice = 0, note = "") {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return null;

  const jl = {
    id: Date.now(),
    jobId,
    kind: (kind === "materiale" || kind === "lavorazione") ? kind : "materiale",
    desc: safeTrim(desc),
    qty: Number(qty) || 1,
    unit: safeTrim(unit) || "pz",
    unitPrice: Number(unitPrice) || 0,
    note: safeTrim(note),
    done: false,
    createdISO: nowISO(),
  };

  state.jobLines.push(jl);
  return jl;
}

function deleteJobLine(jobLineId) {
  const index = state.jobLines.findIndex(jl => jl.id === jobLineId);
  if (index !== -1) {
    state.jobLines.splice(index, 1);
  }
}

function updateJobLine(jobLineId, field, value) {
  const jl = state.jobLines.find(j => j.id === jobLineId);
  if (!jl) return;

  if (field === "desc") {
    jl.desc = safeTrim(value);
  } else if (field === "note") {
    jl.note = safeTrim(value);
  } else if (field === "qty") {
    jl.qty = Number(value) || 1;
  } else if (field === "unit") {
    jl.unit = safeTrim(value) || "pz";
  } else if (field === "unitPrice") {
    jl.unitPrice = parseItalianFloat(value);
  } else if (field === "kind") {
    jl.kind = (value === "materiale" || value === "lavorazione") ? value : "materiale";
  }
}

function toggleJobLineDone(jobLineId) {
  const jl = state.jobLines.find(j => j.id === jobLineId);
  if (jl) jl.done = !jl.done;
}

function getJobLinesCost(jobId) {
  return state.jobLines
    .filter(jl => jl.jobId === jobId && jl.unitPrice > 0)
    .reduce((acc, jl) => acc + (jl.qty * jl.unitPrice), 0);
}

// QUOTES LOGIC
function createQuote(cliente, commessa) {
  const quote = {
    id: Date.now(),
    number: state.quoteCounter++,
    dateISO: nowISO(),
    cliente: safeTrim(cliente),
    commessa: safeUpper(commessa),
    status: "draft",
    notes: "",
    righe: [],
    totals: { taxable: 0, vat: 0, total: 0 },
  };
  state.quotes.push(quote);
  saveState();
  return quote;
}

function addQuoteRiga(quoteId, desc, qty, unitPrice, sconto = 0, iva = 22) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;
  quote.righe.push({
    desc: safeTrim(desc),
    qty: parseFloat(qty) || 1,
    unitPrice: parseFloat(unitPrice) || 0,
    sconto: parseFloat(sconto) || 0,
    iva: parseFloat(iva) || 22,
  });
  recalcQuoteTotals(quoteId);
  saveState();
}

function renderStorageWarning() {
  const banner = $("#storage-warning");
  const badge = $("#storage-badge");
  if (storageDisabled) {
    if (banner) banner.classList.remove("hidden");
    if (badge) badge.classList.remove("hidden");
  } else {
    if (banner) banner.classList.add("hidden");
    if (badge) badge.classList.add("hidden");
  }
}

function getQuoteCalc(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return { taxable: 0, vat: 0, total: 0 };

  let taxable = 0;
  let vat = 0;

  for (const r of quote.righe) {
    const qty = parseFloat(r.qty) || 0;
    const unitPrice = parseFloat(r.unitPrice) || 0;
    const sconto = parseFloat(r.sconto) || 0;
    const iva = parseFloat(r.iva) || 0;

    const lineSubtotal = qty * unitPrice * (1 - sconto / 100);
    const lineVat = lineSubtotal * (iva / 100);

    taxable += lineSubtotal;
    vat += lineVat;
  }

  const total = taxable + vat;

  return {
    taxable: Math.round(taxable * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

function recalcQuoteTotals(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;
  const calc = getQuoteCalc(quoteId);
  quote.totals = calc;
  if (quoteId === currentQuoteId) {
    renderQuoteTotals();
  }
}

function setSelectedQuote(quoteId) {
  currentQuoteId = quoteId;
  state.selectedQuoteId = quoteId;
  saveState();
}

function confirmQuoteAsJob(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return null;

  recalcQuoteTotals(quoteId);
  const job = createJob(
    `Preventivo #${quote.number} - ${quote.cliente}`,
    quote.cliente,
    quote.commessa,
    quote.totals.total,
    `Da preventivo #${quote.number}`
  );

  // Copia le righe del preventivo come righe lavoro (lavorazioni)
  for (const riga of quote.righe) {
    createJobLine(
      job.id,
      "lavorazione",  // Preventivo righe → lavorazioni nel job
      riga.desc,
      riga.qty,
      "pz",
      riga.unitPrice,  // Mantieni il prezzo unitario
      ""
    );
  }

  quote.status = "locked";
  saveState();
  return job;
}

function updateQuoteField(quoteId, field, value) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote || quote.status === "locked") return;
  
  if (field === "cliente" || field === "notes") {
    quote[field] = safeTrim(value);
  } else if (field === "commessa") {
    quote[field] = safeUpper(value);
  }
  saveState();
}

function deleteQuoteRiga(quoteId, rigaIndex) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote || quote.status === "locked") return;
  quote.righe.splice(rigaIndex, 1);
  recalcQuoteTotals(quoteId);
  saveState();
}

function lockQuote(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;
  recalcQuoteTotals(quoteId);
  quote.status = "locked";
  saveState();
}

function unlockQuote(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;
  if (confirm("Sbloccare il preventivo? Tornerà modificabile.")) {
    quote.status = "draft";
    saveState();
    return true;
  }
  return false;
}

function resetQuote(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;

  const ok = confirm("Resettare questo preventivo?\nTutte le righe verranno eliminate e i totali azzerati.");
  if (!ok) return;

  const clearHeader = confirm("Vuoi azzerare anche Cliente, Commessa e Note?");

  quote.status = "draft";
  quote.righe = [];
  quote.totals = { taxable: 0, vat: 0, total: 0 };

  if (clearHeader) {
    quote.cliente = "";
    quote.commessa = "";
    quote.notes = "";
  }

  saveState();
  renderQuotesList($("#quote-search")?.value || "");
  renderQuoteEditor();
  alert("Preventivo resettato ✅");
}

function resetAllData() {
  const ok = confirm("Cancellare TUTTI i dati? L'operazione è irreversibile.");
  if (!ok) return;

  const confirmText = prompt('Per confermare digita "RESET" (maiuscolo).');
  if (!confirmText || confirmText.trim().toUpperCase() !== "RESET") {
    alert("Reset annullato");
    return;
  }

  safeStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  currentJobId = null;
  currentQuoteId = state.selectedQuoteId || null;

  persistAndRenderAll();
  setTab("tab-home");
  alert("Dati azzerati. Puoi ripartire da zero.");
}

function initiateDeleteQuote(quoteId, filterText = "") {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;

  const isLocked = quote.status === "locked";
  showDeleteConfirmation(quoteId, isLocked, filterText);
}

function showDeleteConfirmation(quoteId, isLocked, filterText = "") {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;

  const confirmMsg = isLocked
    ? `Questo preventivo è BLOCCATO. Sei davvero sicuro di volerlo eliminare?\n\n"${quote.cliente}" - Prev. #${quote.number}`
    : `Eliminare questo preventivo?\n\n"${quote.cliente}" - Prev. #${quote.number}`;

  const ok = confirm(confirmMsg);
  if (!ok) return;

  if (isLocked) {
    const doubleConfirm = prompt('Digita "ELIMINA" (maiuscolo) per confermare.');
    if (!doubleConfirm || doubleConfirm.trim().toUpperCase() !== "ELIMINA") {
      alert("Eliminazione annullata");
      return;
    }
  }

  deleteQuote(quoteId, filterText);
}

function deleteQuote(quoteId, filterText = "") {
  const quoteIndex = state.quotes.findIndex(q => q.id === quoteId);
  if (quoteIndex === -1) return;

  const wasSelected = quoteId === currentQuoteId;
  state.quotes.splice(quoteIndex, 1);

  if (wasSelected) {
    if (state.quotes.length > 0) {
      const firstQuote = state.quotes[0];
      currentQuoteId = firstQuote.id;
      state.selectedQuoteId = firstQuote.id;
    } else {
      currentQuoteId = null;
      state.selectedQuoteId = null;
    }
  }

  saveState();
  renderQuotesList(filterText);
  renderQuoteEditor();

  alert("Preventivo eliminato ✅");
}

function duplicateQuote(quoteId) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote) return;

  const newQuote = {
    id: Date.now(),
    number: state.quoteCounter++,
    dateISO: nowISO(),
    cliente: quote.cliente,
    commessa: quote.commessa,
    status: "draft",
    notes: quote.notes,
    righe: quote.righe.map(r => ({
      desc: r.desc,
      qty: r.qty,
      unitPrice: r.unitPrice,
      sconto: r.sconto,
      iva: r.iva,
    })),
    totals: { ...quote.totals },
  };

  state.quotes.push(newQuote);
  upsertAnagrafica("cliente", newQuote.cliente);
  setSelectedQuote(newQuote.id);
  saveState();

  renderQuotesList($("#quote-search")?.value || "");
  renderQuoteEditor();

  alert(`Preventivo duplicato ✅\nNuovo: Prev. #${newQuote.number}`);
}

// PRODUCT HISTORY
function getProductHistory(filters = {}) {
  let lines = [...state.purchaseLines];

  if (filters.prodotto) {
    const q = safeUpper(filters.prodotto);
    lines = lines.filter(l => safeUpper(l.prodotto).includes(q));

    // Recompute totals and quoteCounter/selectedQuoteId
    let maxNumber = st.quoteCounter;
    for (const q of st.quotes) {
      const calc = (() => {
        let taxable = 0, vat = 0;
        for (const r of q.righe) {
          const qty = parseFloat(r.qty) || 0;
          const up = parseFloat(r.unitPrice) || 0;
          const sc = parseFloat(r.sconto) || 0;
          const iv = parseFloat(r.iva) || 0;
          const sub = qty * up * (1 - sc / 100);
          taxable += sub;
          vat += sub * (iv / 100);
        }
        const total = taxable + vat;
        return {
          taxable: Math.round(taxable * 100) / 100,
          vat: Math.round(vat * 100) / 100,
          total: Math.round(total * 100) / 100,
        };
      })();
      q.totals = calc;
      if (q.number && q.number >= maxNumber) maxNumber = q.number + 1;
    }
    st.quoteCounter = maxNumber || 1;
    if (st.selectedQuoteId && !st.quotes.find(q => q.id === st.selectedQuoteId)) {
      st.selectedQuoteId = st.quotes[0]?.id || null;
    }

  }

  if (filters.fornitore) {
    const q = safeTrim(filters.fornitore).toLowerCase();
    lines = lines.filter(l => l.fornitore.toLowerCase().includes(q));
  }

  if (filters.annoMin) {
    const y = parseInt(filters.annoMin, 10);
    lines = lines.filter(l => new Date(l.dateISO).getFullYear() >= y);
  }

  if (filters.annoMax) {
    const y = parseInt(filters.annoMax, 10);
    lines = lines.filter(l => new Date(l.dateISO).getFullYear() <= y);
  }

  return lines.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
}

function getProductStats(prodotto) {
  const q = safeUpper(prodotto);
  const lines = state.purchaseLines.filter(l => safeUpper(l.prodotto).includes(q));

  if (lines.length === 0) {
    return { minPrice: 0, avgPrice: 0, maxPrice: 0, lastPrice: 0, qty: 0, count: 0 };
  }

  const prices = lines.map(l => l.unitPrice);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
  const lastPrice = lines[0].unitPrice;
  const qty = lines.reduce((a, l) => a + l.qty, 0);

  return {
    minPrice: Math.round(minPrice * 100) / 100,
    avgPrice: Math.round(avgPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    lastPrice: Math.round(lastPrice * 100) / 100,
    qty,
    count: lines.length,
  };
}

// RENDERING
function getSaldoAttuale() {
  return state.saldoIniziale + state.movimenti.reduce((acc, m) => {
    return m.tipo === "entrata" ? acc + m.importo : acc - m.importo;
  }, 0);
}

function calcTotali(movs) {
  let entrate = 0, uscite = 0;
  for (const m of movs) {
    if (m.tipo === "entrata") entrate += m.importo;
    else uscite += m.importo;
  }
  return { entrate, uscite, margine: entrate - uscite };
}

function sortMovimentiAsc(movs) {
  return [...movs].sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
}

function renderCompany() {
  const name = safeTrim(state.companyName) || "La tua ditta";
  const el = $("#company-name");
  if (el) el.textContent = name;
  document.title = `BizManager Pro - ${name}`;
}

function renderKPI() {
  const saldo = getSaldoAttuale();
  const { entrate, uscite } = calcTotali(state.movimenti);

  const kpiBanca = $("#kpi-banca");
  if (kpiBanca) kpiBanca.innerText = formatMoney.format(saldo);
  
  const kpiEntrate = $("#kpi-entrate");
  if (kpiEntrate) kpiEntrate.innerText = formatMoney.format(entrate);
  
  const kpiUscite = $("#kpi-uscite");
  if (kpiUscite) kpiUscite.innerText = formatMoney.format(uscite);
}

function renderHomeJobs() {
  const wrap = $("#open-jobs-list");
  if (!wrap) return;

  const openJobs = state.jobs.filter(j => j.stato === "aperto");
  openJobs.sort((a, b) => getJobDue(b.id) - getJobDue(a.id));

  wrap.innerHTML = "";
  if (openJobs.length === 0) {
    wrap.innerHTML = '<p class="text-center text-gray-400 text-sm py-8">Nessun lavoro aperto</p>';
    return;
  }

  for (const job of openJobs) {
    const due = getJobDue(job.id);
    const paid = getJobPaid(job.id);

    const card = document.createElement("div");
    card.className = "job-card relative cursor-pointer transition hover:shadow-md";
    card.innerHTML = `
      <div class="home-card-actions">
        <button class="btn-icon-trash" data-job-id="${job.id}" title="Archivia lavoro">
          <i class="fa-solid fa-box"></i>
        </button>
      </div>
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold text-gray-900">${escapeHTML(job.titolo)}</h4>
          <p class="text-xs text-gray-500 mt-1">${escapeHTML(job.cliente)} · ${escapeHTML(job.commessa)}</p>
        </div>
        <span class="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full font-semibold">Aperto</span>
      </div>
      <div class="flex justify-between items-end mt-4">
        <div>
          <p class="text-xs text-gray-400 font-semibold">Residuo</p>
          <p class="text-2xl font-black text-blue-600">${formatMoney.format(due)}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Incassato: ${formatMoney.format(paid)}</p>
          <p class="text-xs text-gray-400">Totale: ${formatMoney.format(job.agreedTotal)}</p>
        </div>
      </div>
    `;
    card.addEventListener("click", () => openJobDetail(job.id));
    wrap.appendChild(card);

    // Wire trash button
    const archiveBtn = card.querySelector(".btn-icon-trash");
    if (archiveBtn) {
      archiveBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openArchiveJobConfirm(job.id);
      });
    }
  }
}

// Alias per compatibilità
const renderHomeOpenJobs = renderHomeJobs;

// Generic toast
function showToast(message, ms = 2500) {
  const toast = $("#app-toast");
  if (!toast) return;
  toast.textContent = String(message || "");
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
    toast.textContent = "";
  }, ms);
}

// Generic confirm modal
function showConfirmModal({ title = "Conferma", text = "Sei sicuro?", okLabel = "OK", cancelLabel = "Annulla", onOk = null, onCancel = null }) {
  const modal = $("#confirm-modal");
  const titleEl = $("#confirm-title");
  const textEl = $("#confirm-text");
  const okBtn = $("#confirm-ok");
  const cancelBtn = $("#confirm-cancel");
  if (!modal || !titleEl || !textEl || !okBtn || !cancelBtn) {
    const proceed = confirm(text);
    if (proceed && typeof onOk === "function") onOk();
    else if (!proceed && typeof onCancel === "function") onCancel();
    return;
  }

  titleEl.textContent = title;
  textEl.textContent = text;
  okBtn.textContent = okLabel;
  cancelBtn.textContent = cancelLabel;

  const cleanup = () => {
    modal.classList.add("hidden");
    okBtn.replaceWith(okBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  };

  modal.classList.remove("hidden");

  // Re-query buttons after replaceWith
  const ok = $("#confirm-ok");
  const cancel = $("#confirm-cancel");

  if (ok) ok.addEventListener("click", () => {
    cleanup();
    if (typeof onOk === "function") onOk();
  });
  if (cancel) cancel.addEventListener("click", () => {
    cleanup();
    if (typeof onCancel === "function") onCancel();
  });
}

function openDeleteJobConfirm(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  const paymentsCount = state.jobPayments.filter(jp => jp.jobId === jobId).length;
  const linesCount = state.jobLines.filter(jl => jl.jobId === jobId).length;
  const purchasesCount = state.purchaseLines.filter(pl => safeUpper(pl.commessa) === safeUpper(job.commessa)).length;

  const text = `Eliminare il lavoro "${job.titolo}"?\n\nSaranno rimossi anche:\n• Incassi: ${paymentsCount}\n• Righe lavoro: ${linesCount}\n• Acquisti per commessa: ${purchasesCount}`;

  showConfirmModal({
    title: "Elimina lavoro",
    text,
    okLabel: "Elimina",
    cancelLabel: "Annulla",
    onOk: () => {
      deleteJobCascade(jobId);
      showToast("Lavoro eliminato ✅");
    }
  });
}

function openArchiveJobConfirm(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  const text = `Archiviare il lavoro "${job.titolo}"?\n\nIl lavoro verrà nascosto dalla Home ma resterà disponibile nei Lavori (Archivio).`;
  showConfirmModal({
    title: "Archivia lavoro",
    text,
    okLabel: "Archivia",
    cancelLabel: "Annulla",
    onOk: () => {
      archiveJob(jobId);
      showToast("Lavoro archiviato ✅");
    }
  });
}

function archiveJob(jobId) {
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  job.stato = "archived";
  persistAndRenderAll();
}

function deleteJobCascade(jobId) {
  const jobIndex = state.jobs.findIndex(j => j.id === jobId);
  const job = state.jobs[jobIndex];
  if (jobIndex === -1 || !job) return;

  // Remove job
  state.jobs.splice(jobIndex, 1);

  // Cascade remove payments and job lines
  state.jobPayments = state.jobPayments.filter(jp => jp.jobId !== jobId);
  state.jobLines = state.jobLines.filter(jl => jl.jobId !== jobId);

  // Cascade remove purchases by commessa
  const commessaKey = safeUpper(job.commessa);
  state.purchaseLines = state.purchaseLines.filter(pl => safeUpper(pl.commessa) !== commessaKey);

  // Reset selection if needed
  if (currentJobId === jobId) {
    currentJobId = null;
  }

  // Persist and rerender
  persistAndRenderAll();
  setTab("tab-home");
}

// Jobs Tab rendering with filter
let jobsFilter = "open"; // 'open' | 'archived'

function renderJobsTab() {
  const wrap = $("#jobs-list");
  if (!wrap) return;

  const btnOpen = $("#jobs-filter-open");
  const btnArchived = $("#jobs-filter-archived");
  if (btnOpen && btnArchived) {
    if (jobsFilter === "open") {
      btnOpen.className = "px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700";
      btnArchived.className = "px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700";
    } else {
      btnOpen.className = "px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700";
      btnArchived.className = "px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700";
    }
  }

  const jobs = state.jobs
    .filter(j => jobsFilter === "open" ? j.stato === "aperto" : j.stato === "archived")
    .sort((a, b) => jobsFilter === "open" ? (getJobDue(b.id) - getJobDue(a.id)) : (new Date(b.createdISO) - new Date(a.createdISO)));

  wrap.innerHTML = "";
  if (jobs.length === 0) {
    wrap.innerHTML = `<p class="text-center text-gray-400 text-sm py-8">${jobsFilter === "open" ? "Nessun lavoro aperto" : "Nessun lavoro archiviato"}</p>`;
    return;
  }

  for (const job of jobs) {
    const due = getJobDue(job.id);
    const paid = getJobPaid(job.id);
    const card = document.createElement("div");
    card.className = "job-card cursor-pointer transition hover:shadow-md";
    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold text-gray-900">${escapeHTML(job.titolo)}</h4>
          <p class="text-xs text-gray-500 mt-1">${escapeHTML(job.cliente)} · ${escapeHTML(job.commessa)}</p>
        </div>
        <span class="text-xs px-2 py-1 ${jobsFilter === "open" ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-700"} rounded-full font-semibold">${jobsFilter === "open" ? "Aperto" : "Archiviato"}</span>
      </div>
      <div class="flex justify-between items-end mt-4">
        <div>
          <p class="text-xs text-gray-400 font-semibold">Residuo</p>
          <p class="text-2xl font-black text-blue-600">${formatMoney.format(due)}</p>
        </div>
        <div class="text-right">
          <p class="text-xs text-gray-400">Incassato: ${formatMoney.format(paid)}</p>
          <p class="text-xs text-gray-400">Totale: ${formatMoney.format(job.agreedTotal)}</p>
        </div>
      </div>
    `;
    card.addEventListener("click", () => openJobDetail(job.id));
    wrap.appendChild(card);
  }
}

// STATE
let state = loadState();
let currentJobId = null;
let currentQuoteId = null;
let chart = null;
let quoteCreateMode = false;
let wizardClienteTemp = "";

// UTILITY: conversione virgola->punto per input italiani
function parseItalianFloat(value) {
  const str = String(value).trim().replace(",", ".");
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

currentQuoteId = state.selectedQuoteId || state.quotes[0]?.id || null;

// TAB NAVIGATION
function setTab(tabId) {
  document.querySelectorAll(".tab-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("tab-btn-active"));
  const tab = $(`#${tabId}`);
  if (tab) tab.classList.remove("hidden");
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.classList.add("tab-btn-active");
  if (tabId === "tab-quotes") {
    renderQuotesList($("#quote-search")?.value || "");
    renderQuoteEditor();
  }
  if (tabId === "tab-payment") {
    populatePaymentJobSelect();
  }
  if (tabId === "tab-jobs") {
    renderJobsTab();
  }
}

// JOB DETAIL
function openJobDetail(jobId) {
  currentJobId = jobId;
  setTab("tab-job-detail");
  renderJobDetail();
}

function renderJobDetail() {
  if (!currentJobId) return;

  const job = state.jobs.find(j => j.id === currentJobId);
  if (!job) return;

  const due = getJobDue(currentJobId);
  const paid = getJobPaid(currentJobId);
  const estimatedCost = getJobLinesCost(currentJobId);

  const titleEl = $("#job-detail-title");
  if (titleEl) titleEl.innerText = escapeHTML(job.titolo);

  const clienteEl = $("#job-detail-cliente");
  if (clienteEl) clienteEl.innerText = escapeHTML(job.cliente);

  const commessaEl = $("#job-detail-commessa");
  if (commessaEl) commessaEl.innerText = escapeHTML(job.commessa);

  const statusEl = $("#job-detail-status");
  if (statusEl) {
    let statusText = "Aperto";
    if (job.stato === "chiuso") statusText = "Chiuso ✅";
    else if (job.stato === "archived") statusText = "Archiviato 📦";
    statusEl.innerText = statusText;
  }

  const dueEl = $("#job-detail-due");
  if (dueEl) dueEl.innerText = formatMoney.format(due);

  const paidEl = $("#job-detail-paid");
  if (paidEl) paidEl.innerText = formatMoney.format(paid);

  const totalEl = $("#job-detail-total");
  if (totalEl) totalEl.innerText = formatMoney.format(job.agreedTotal);

  const costEl = $("#job-detail-cost");
  if (costEl) costEl.innerText = formatMoney.format(estimatedCost);

  renderJobPaymentsTab();
  renderJobLinesTab();
  renderJobPurchasesTab();

  const noteEl = $("#job-detail-note");
  if (noteEl) noteEl.value = job.note;

  // Actions: archive/delete
  const btnArchive = $("#btn-archive-job");
  if (btnArchive) {
    btnArchive.disabled = job.stato === "archived";
    btnArchive.onclick = () => openArchiveJobConfirm(currentJobId);
  }
  const btnDelete = $("#btn-delete-job-detail");
  if (btnDelete) {
    btnDelete.onclick = () => openDeleteJobConfirm(currentJobId);
  }
}

function renderJobPaymentsTab() {
  const wrap = $("#job-payments-list");
  if (!wrap) return;

  const payments = state.jobPayments.filter(jp => jp.jobId === currentJobId);
  wrap.innerHTML = "";

  if (payments.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4">Nessun incasso registrato</p>';
    return;
  }

  for (const jp of payments.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))) {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="t1">${formatMoney.format(jp.amount)}</div>
        <div class="t2">${fmtShortDate(jp.dateISO)} · ${escapeHTML(jp.method)}</div>
      </div>
    `;
    wrap.appendChild(row);
  }
}

function renderJobPurchasesTab() {
  const wrap = $("#job-purchases-list");
  if (!wrap) return;

  const job = state.jobs.find(j => j.id === currentJobId);
  const purchases = state.purchaseLines.filter(pl => safeUpper(pl.commessa) === safeUpper(job?.commessa || ""));
  wrap.innerHTML = "";

  if (purchases.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4">Nessun acquisto per questa commessa</p>';
    return;
  }

  for (const pl of purchases.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO))) {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="left">
        <div class="t1">${escapeHTML(pl.prodotto)}</div>
        <div class="t2">${fmtShortDate(pl.dateISO)} · ${escapeHTML(pl.fornitore)} · Qty ${pl.qty} @ ${formatMoney.format(pl.unitPrice)}</div>
      </div>
      <div class="font-black">${formatMoney.format(pl.qty * pl.unitPrice)}</div>
    `;
    wrap.appendChild(row);
  }
}

function renderJobLinesTab() {
  const wrap = $("#job-lines-list");
  if (!wrap) return;

  const lines = state.jobLines.filter(jl => jl.jobId === currentJobId);
  wrap.innerHTML = "";

  if (lines.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4">Nessuna riga di lavoro</p>';
    return;
  }

  for (const jl of lines.sort((a, b) => new Date(a.createdISO) - new Date(b.createdISO))) {
    const row = document.createElement("div");
    row.className = `job-line-item ${jl.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" class="jl-checkbox" data-jl-id="${jl.id}" ${jl.done ? "checked" : ""} />
      <div class="jl-content">
        <div class="jl-header">
          <span class="jl-kind badge-${jl.kind}">${jl.kind === "materiale" ? "📦" : "🔧"} ${jl.kind}</span>
          <span class="jl-desc" data-jl-id="${jl.id}" data-field="desc">${escapeHTML(jl.desc)}</span>
        </div>
        <div class="jl-details">
          <span class="jl-qty" data-jl-id="${jl.id}" data-field="qty">${jl.qty} ${escapeHTML(jl.unit)}</span>
          ${jl.unitPrice > 0 ? `<span class="jl-price">${formatMoney.format(jl.qty * jl.unitPrice)}</span>` : ""}
          ${jl.note ? `<span class="jl-note">${escapeHTML(jl.note)}</span>` : ""}
        </div>
      </div>
      <button class="btn-delete-jl" data-jl-id="${jl.id}" title="Elimina riga">
        <i class="fa-solid fa-trash text-sm"></i>
      </button>
    `;
    wrap.appendChild(row);
  }

  // Event listeners
  document.querySelectorAll(".jl-checkbox").forEach(cb => {
    cb.addEventListener("change", (e) => {
      const jlId = Number(e.target.dataset.jlId);
      toggleJobLineDone(jlId);
      saveState();
      renderJobLinesTab();
    });
  });

  document.querySelectorAll(".btn-delete-jl").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const jlId = Number(btn.dataset.jlId);
      deleteJobLine(jlId);
      saveState();
      renderJobLinesTab();
    });
  });
}

function addJobLineFromForm() {
  if (!currentJobId) {
    console.warn("[JobLine] Nessun lavoro selezionato");
    return;
  }

  const kindSelect = document.querySelector("#jl-kind-select");
  const descInput = document.querySelector("#jl-desc");
  const qtyInput = document.querySelector("#jl-qty");
  const unitInput = document.querySelector("#jl-unit");
  const priceInput = document.querySelector("#jl-price");
  const noteInput = document.querySelector("#jl-note");

  const kind = kindSelect ? kindSelect.value : "materiale";
  const desc = safeTrim(descInput?.value || "");
  const qty = parseItalianFloat(qtyInput?.value || "1");
  const unit = safeTrim(unitInput?.value || "pz");
  const unitPrice = parseItalianFloat(priceInput?.value || "0");
  const note = safeTrim(noteInput?.value || "");

  if (!desc) {
    alert("Descrizione obbligatoria");
    if (descInput) descInput.focus();
    return;
  }

  createJobLine(currentJobId, kind, desc, qty, unit, unitPrice, note);
  saveState();

  // Clear form
  if (descInput) descInput.value = "";
  if (qtyInput) qtyInput.value = "1";
  if (unitInput) unitInput.value = "pz";
  if (priceInput) priceInput.value = "";
  if (noteInput) noteInput.value = "";
  if (kindSelect) kindSelect.value = "materiale";

  if (descInput) descInput.focus();
  renderJobLinesTab();
}

function addJobPaymentFromForm() {
  // Determina quale tab è visibile
  const isPaymentTab = !$("#tab-payment").classList.contains("hidden");
  const isJobDetailTab = !$("#tab-job-detail").classList.contains("hidden");

  let jobId, amtInput, amount, method;

  if (isPaymentTab) {
    // Tab "Registra Incasso" - scegli lavoro dal select
    const selectEl = $("#payment-job-select");
    jobId = selectEl ? Number(selectEl.value) : null;
    amtInput = $("#jp-amount-payment");
    const methodInput = $("#jp-method");
    
    if (!jobId) {
      alert("Seleziona un lavoro");
      return;
    }

    const rawAmount = amtInput ? amtInput.value : '';
    amount = parseItalianFloat(rawAmount);
    method = methodInput ? safeTrim(methodInput.value) || 'bonifico' : 'bonifico';

  } else if (isJobDetailTab) {
    // Tab "Dettaglio Lavoro" - usa currentJobId
    jobId = currentJobId;
    amtInput = $("#jp-amount-detail");
    
    const rawAmount = amtInput ? amtInput.value : '';
    amount = parseItalianFloat(rawAmount);
    method = "bonifico";  // Non serve in dettaglio
  } else {
    console.warn('[Payment] Nessun tab valido');
    return;
  }

  if (!jobId) {
    console.warn('[Payment] Nessun lavoro selezionato');
    alert("Nessun lavoro selezionato");
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("Importo non valido");
    console.warn('[Payment] Importo non valido:', amount);
    return;
  }

  // Crea pagamento
  const payment = createJobPayment(jobId, amount, method);
  if (!payment) {
    alert("Errore nella creazione del pagamento");
    return;
  }

  // Aggiorna UI live
  saveState();
  renderKPI();
  renderHomeOpenJobs();
  
  // Se siamo nel dettaglio, aggiorna anche quello
  if (isJobDetailTab && currentJobId === jobId) {
    renderJobDetail();
  }

  // Pulisci input
  if (amtInput) {
    amtInput.value = '';
    amtInput.focus();
  }

  alert("Incasso registrato ✅");
  console.log('[Payment] jobId:', jobId, 'amount:', amount, 'method:', method);
}

function saveJobNote() {
  if (!currentJobId) return;
  const note = safeTrim($("#job-detail-note").value);
  updateJobNote(currentJobId, note);
  saveState();
}

function populatePaymentJobSelect() {
  const selectEl = $("#payment-job-select");
  if (!selectEl) return;

  // Filtra solo lavori aperti
  const openJobs = state.jobs.filter(j => j.stato === "aperto");
  
  // Conserva l'opzione "Scegli"
  selectEl.innerHTML = '<option value="">-- Scegli un lavoro --</option>';

  for (const job of openJobs) {
    const paid = getJobPaid(job.id);
    const due = getJobDue(job.id);
    
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = `${job.titolo} (${job.cliente} · Residuo: ${formatMoney.format(due)})`;
    selectEl.appendChild(option);
  }

  // Se non ci sono lavori aperti, mostra messaggio
  if (openJobs.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nessun lavoro aperto";
    option.disabled = true;
    selectEl.appendChild(option);
  }
}

function onPaymentJobSelectChange() {
  const selectEl = $("#payment-job-select");
  if (!selectEl) return;
  const jobId = Number(selectEl.value);
  if (jobId) {
    currentJobId = jobId;
  }
}

function createNewJob() {
  const titolo = safeTrim($("#new-job-titolo").value);
  const cliente = safeTrim($("#new-job-cliente").value);
  const commessa = safeTrim($("#new-job-commessa").value);
  const agreedTotal = parseImporto($("#new-job-total").value);

  if (!titolo) return alert("Titolo lavoro obbligatorio");
  if (!cliente) return alert("Cliente obbligatorio");
  if (!commessa) return alert("Commessa obbligatorio");
  if (!Number.isFinite(agreedTotal) || agreedTotal <= 0) return alert("Totale non valido");

  createJob(titolo, cliente, commessa, agreedTotal);
  
  $("#new-job-titolo").value = "";
  $("#new-job-cliente").value = "";
  $("#new-job-commessa").value = "";
  $("#new-job-total").value = "";

  persistAndRenderAll();
  renderHomeJobs();
  alert("Lavoro creato ✅");
}

// QUOTES UI
function renderQuotesList(filterText = "") {
  const wrap = $("#quotes-list");
  if (!wrap) return;

  const filter = safeUpper(filterText);
  let quotes = [...state.quotes].sort((a, b) => b.number - a.number);
  
  if (filter) {
    quotes = quotes.filter(q => 
      safeUpper(q.cliente).includes(filter) || 
      safeUpper(q.commessa).includes(filter)
    );
  }

  wrap.innerHTML = "";
  
  if (quotes.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4 text-center">Nessun preventivo</p>';
    return;
  }

  for (const q of quotes) {
    const card = document.createElement("div");
    card.className = `quote-list-card ${q.id === currentQuoteId ? "active" : ""}`;
    
    const statusClass = q.status === "locked" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700";
    const statusText = q.status === "locked" ? "🔒 Bloccato" : "✏️ Bozza";
    
    card.innerHTML = `
      <div class="flex justify-between items-start mb-2">
        <div class="font-bold text-gray-900">Prev. #${q.number}</div>
        <div class="flex items-center gap-2">
          <span class="text-xs px-2 py-1 rounded-full font-semibold ${statusClass}">${statusText}</span>
          <button class="quote-duplicate-btn text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded transition" data-quote-id="${q.id}" title="Duplica preventivo">
            <i class="fa-solid fa-copy text-sm"></i>
          </button>
          <button class="quote-delete-btn text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition" data-quote-id="${q.id}" title="Elimina preventivo">
            <i class="fa-solid fa-trash text-sm"></i>
          </button>
        </div>
      </div>
      <div class="text-sm text-gray-600 mb-1">${escapeHTML(q.cliente)}</div>
      <div class="text-xs text-gray-400">${escapeHTML(q.commessa)}</div>
      <div class="text-xs text-gray-400 mt-2">${fmtShortDate(q.dateISO)}</div>
      <div class="text-lg font-bold text-blue-600 mt-2">${formatMoney.format(q.totals.total)}</div>
    `;
    
    card.addEventListener("click", (e) => {
      if (!e.target.closest(".quote-delete-btn") && !e.target.closest(".quote-duplicate-btn")) {
        setSelectedQuote(q.id);
        renderQuotesList(filterText);
        renderQuoteEditor();
      }
    });

    const deleteBtn = card.querySelector(".quote-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        initiateDeleteQuote(q.id, filterText);
      });
    }

    const duplicateBtn = card.querySelector(".quote-duplicate-btn");
    if (duplicateBtn) {
      duplicateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        duplicateQuote(q.id);
      });
    }
    
    wrap.appendChild(card);
  }
}

function renderQuoteEditor() {
  const emptyEl = $("#quote-editor-empty");
  const wizardEl = $("#quote-wizard");
  const editorEl = $("#quote-editor");

  if (quoteCreateMode) {
    if (emptyEl) emptyEl.classList.add("hidden");
    if (wizardEl) wizardEl.classList.remove("hidden");
    if (editorEl) editorEl.classList.add("hidden");
    return;
  }

  if (!currentQuoteId) {
    if (emptyEl) emptyEl.classList.remove("hidden");
    if (wizardEl) wizardEl.classList.add("hidden");
    if (editorEl) editorEl.classList.add("hidden");
    return;
  }

  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote) return;

  if (emptyEl) emptyEl.classList.add("hidden");
  if (wizardEl) wizardEl.classList.add("hidden");
  if (editorEl) editorEl.classList.remove("hidden");

  recalcQuoteTotals(currentQuoteId);

  const isLocked = quote.status === "locked";

  $("#qe-number").innerText = String(quote.number);
  $("#qe-date").innerText = fmtShortDate(quote.dateISO);
  
  const statusBadge = $("#qe-status-badge");
  if (isLocked) {
    statusBadge.className = "px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700";
    statusBadge.innerText = "🔒 Bloccato";
  } else {
    statusBadge.className = "px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700";
    statusBadge.innerText = "✏️ Bozza";
  }

  const clienteInput = $("#qe-cliente");
  const commessaInput = $("#qe-commessa");
  const notesInput = $("#qe-notes");

  clienteInput.value = quote.cliente;
  commessaInput.value = quote.commessa;
  notesInput.value = quote.notes;

  clienteInput.disabled = isLocked;
  commessaInput.disabled = isLocked;
  notesInput.disabled = isLocked;

  renderQuoteRighe();
  renderQuoteTotals();

  $("#btn-qe-lock").classList.toggle("hidden", isLocked);
  $("#btn-qe-unlock").classList.toggle("hidden", !isLocked);
  $("#qe-add-riga-form").classList.toggle("hidden", isLocked);
}

function renderQuoteRighe() {
  if (!currentQuoteId) return;
  
  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote) return;

  const wrap = $("#qe-righe-list");
  if (!wrap) return;

  const isLocked = quote.status === "locked";

  wrap.innerHTML = "";

  if (quote.righe.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4">Nessuna riga inserita</p>';
    return;
  }

  quote.righe.forEach((riga, index) => {
    const qty = parseFloat(riga.qty) || 0;
    const unitPrice = parseFloat(riga.unitPrice) || 0;
    const sconto = parseFloat(riga.sconto) || 0;
    const iva = parseFloat(riga.iva) || 0;

    const lineSubtotal = qty * unitPrice * (1 - sconto / 100);
    const lineVat = lineSubtotal * (iva / 100);
    const lineTotal = lineSubtotal + lineVat;

    const row = document.createElement("div");
    row.className = "quote-riga-item";
    row.innerHTML = `
      <div class="left space-y-2">
        <input type="text" data-field="desc" data-index="${index}" value="${escapeHTML(riga.desc)}" class="input-apple w-full" ${isLocked ? "disabled" : ""} />
        <div class="grid grid-cols-4 gap-2 text-xs text-gray-600">
          <input type="text" data-field="qty" data-index="${index}" value="${qty}" class="input-apple" ${isLocked ? "disabled" : ""} />
          <input type="text" data-field="unitPrice" data-index="${index}" value="${unitPrice}" class="input-apple" ${isLocked ? "disabled" : ""} />
          <input type="text" data-field="sconto" data-index="${index}" value="${sconto}" class="input-apple" ${isLocked ? "disabled" : ""} />
          <input type="text" data-field="iva" data-index="${index}" value="${iva}" class="input-apple" ${isLocked ? "disabled" : ""} />
        </div>
      </div>
      <div class="right">
        <div class="font-bold text-gray-900 text-right">${formatMoney.format(lineTotal)}</div>
        ${!isLocked ? `<button class="btn-delete-riga" data-index="${index}">
          <i class="fa-solid fa-trash"></i>
        </button>` : ""}
      </div>
    `;
    wrap.appendChild(row);
  });

  if (!isLocked) {
    document.querySelectorAll(".btn-delete-riga").forEach(btn => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index);
        deleteQuoteRiga(currentQuoteId, index);
        renderQuoteEditor();
      });
    });

    document.querySelectorAll("#qe-righe-list input[data-field]").forEach(inp => {
      inp.addEventListener("input", handleQuoteLineChange);
      inp.addEventListener("change", handleQuoteLineChange);
      inp.addEventListener("blur", handleQuoteLineChange);
    });
  }
}

function renderQuoteTotals() {
  if (!currentQuoteId) return;

  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote) return;

  $("#qe-taxable").innerText = formatMoney.format(quote.totals.taxable);
  $("#qe-vat").innerText = formatMoney.format(quote.totals.vat);
  $("#qe-total").innerText = formatMoney.format(quote.totals.total);
}

function updateQuoteLine(quoteId, index, field, value) {
  const quote = state.quotes.find(q => q.id === quoteId);
  if (!quote || quote.status === "locked") return;
  const line = quote.righe[index];
  if (!line) return;

  if (field === "desc") {
    line.desc = safeTrim(value);
  } else {
    const num = parseItalianFloat(value);
    if (field === "qty") line.qty = num;
    if (field === "unitPrice") line.unitPrice = num;
    if (field === "sconto") line.sconto = num;
    if (field === "iva") line.iva = num;
  }

  recalcQuoteTotals(quoteId);
  saveState();
}

function handleQuoteLineChange(e) {
  const index = Number(e.target.dataset.index);
  const field = e.target.dataset.field;
  updateQuoteLine(currentQuoteId, index, field, e.target.value);
  renderQuoteEditor();
}

function createNewQuoteFromUI() {
  quoteCreateMode = true;
  wizardClienteTemp = "";
  renderQuoteEditor();
  setTimeout(() => {
    const input = $("#wiz-cliente");
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 100);
}

function openWizardStep2() {
  const clienteInput = $("#wiz-cliente");
  const clienteValue = safeTrim(clienteInput.value);
  const errorMsg = $("#wiz-cliente-error");

  if (!clienteValue) {
    errorMsg.classList.remove("hidden");
    clienteInput.focus();
    return;
  }

  wizardClienteTemp = clienteValue;
  errorMsg.classList.add("hidden");

  const step1 = $("#wizard-step-1");
  const step2 = $("#wizard-step-2");
  const displayEl = $("#wiz-cliente-display");
  const stepIndicator = $("#wiz-step-indicator");
  const autocomplete = $("#wiz-cliente-autocomplete");

  if (step1) step1.classList.add("hidden");
  if (step2) {
    step2.classList.remove("hidden");
    const commessaInput = step2.querySelector("#wiz-commessa");
    if (commessaInput) {
      commessaInput.value = "";
      setTimeout(() => {
        commessaInput.focus();
        commessaInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }
  if (displayEl) displayEl.textContent = escapeHTML(wizardClienteTemp);
  if (stepIndicator) stepIndicator.textContent = "Passo 2/2";
  if (autocomplete) autocomplete.classList.add("hidden");

  const commessaError = $("#wiz-commessa-error");
  if (commessaError) commessaError.classList.add("hidden");
}

function backWizardStep1() {
  const step1 = $("#wizard-step-1");
  const step2 = $("#wizard-step-2");
  const stepIndicator = $("#wiz-step-indicator");

  if (step2) step2.classList.add("hidden");
  if (step1) {
    step1.classList.remove("hidden");
    const clienteInput = step1.querySelector("#wiz-cliente");
    if (clienteInput) {
      setTimeout(() => {
        clienteInput.focus();
        clienteInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }
  if (stepIndicator) stepIndicator.textContent = "Passo 1/2";
}

function closeWizard() {
  quoteCreateMode = false;
  wizardClienteTemp = "";

  // Reset input e UI
  const clienteInput = $("#wiz-cliente");
  const commessaInput = $("#wiz-commessa");
  const step1 = $("#wizard-step-1");
  const step2 = $("#wizard-step-2");
  const stepIndicator = $("#wiz-step-indicator");
  const clienteError = $("#wiz-cliente-error");
  const commessaError = $("#wiz-commessa-error");
  const autocomplete = $("#wiz-cliente-autocomplete");

  if (clienteInput) {
    clienteInput.value = "";
    clienteInput.focus();
  }
  if (commessaInput) commessaInput.value = "";
  if (step1) step1.classList.remove("hidden");
  if (step2) step2.classList.add("hidden");
  if (stepIndicator) stepIndicator.textContent = "Passo 1/2";
  if (clienteError) clienteError.classList.add("hidden");
  if (commessaError) commessaError.classList.add("hidden");
  if (autocomplete) autocomplete.classList.add("hidden");

  renderQuoteEditor();
}

function createQuoteFromWizard() {
  const clienteValue = wizardClienteTemp;
  const commessaInput = $("#wiz-commessa");
  const commessaValue = safeTrim(commessaInput?.value || "");
  const errorMsg = $("#wiz-commessa-error");

  if (!commessaValue) {
    if (errorMsg) errorMsg.classList.remove("hidden");
    if (commessaInput) commessaInput.focus();
    return;
  }

  if (errorMsg) errorMsg.classList.add("hidden");

  upsertAnagrafica("cliente", clienteValue);
  const quote = createQuote(clienteValue, commessaValue);
  setSelectedQuote(quote.id);

  quoteCreateMode = false;
  wizardClienteTemp = "";

  renderQuotesList($("#quote-search")?.value || "");
  renderQuoteEditor();

  setTimeout(() => {
    const descInput = $("#qe-new-desc");
    if (descInput) descInput.focus();
  }, 100);
}

function showWizardAutoComplete(inputValue) {
  const container = $("#wiz-cliente-autocomplete");
  if (!container) return;

  if (!inputValue.trim()) {
    container.classList.add("hidden");
    return;
  }

  const q = safeUpper(inputValue);
  const filtered = state.anagrafiche.clienti.filter(c => safeUpper(c).includes(q));

  if (filtered.length === 0) {
    container.classList.add("hidden");
    return;
  }

  container.innerHTML = filtered
    .slice(0, 8)
    .map(
      (item) =>
        `<div class="wiz-autocomplete-item" data-client="${escapeHTML(item)}">${escapeHTML(item)}</div>`
    )
    .join("");

  container.classList.remove("hidden");

  container.querySelectorAll(".wiz-autocomplete-item").forEach((el) => {
    el.addEventListener("click", () => {
      const clientInput = $("#wiz-cliente");
      if (clientInput) clientInput.value = el.dataset.client;
      container.classList.add("hidden");
    });
  });
}

function addQuoteRigaFromUI() {
  if (!currentQuoteId) {
    alert("Crea o seleziona un preventivo prima di aggiungere righe");
    return;
  }

  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote || quote.status === "locked") return;

  const descInput = $("#qe-new-desc");
  const qtyInput = $("#qe-new-qty");
  const priceInput = $("#qe-new-price");
  const scontoInput = $("#qe-new-sconto");
  const ivaInput = $("#qe-new-iva");

  const desc = safeTrim(descInput.value);
  const qty = parseItalianFloat(qtyInput.value);
  const price = parseItalianFloat(priceInput.value);
  const sconto = parseItalianFloat(scontoInput.value);
  const iva = parseItalianFloat(ivaInput.value);

  if (!desc) return alert("Descrizione obbligatoria");
  if (qty <= 0) return alert("Quantità deve essere > 0");
  if (price < 0) return alert("Prezzo non valido");

  addQuoteRiga(currentQuoteId, desc, qty, price, sconto, iva);

  descInput.value = "";
  qtyInput.value = "1";
  priceInput.value = "";
  scontoInput.value = "0";
  ivaInput.value = "22";

  descInput.focus();
  renderQuoteEditor();
}

function saveQuoteFieldsFromUI() {
  if (!currentQuoteId) return;

  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote || quote.status === "locked") return;

  updateQuoteField(currentQuoteId, "cliente", $("#qe-cliente").value);
  updateQuoteField(currentQuoteId, "commessa", $("#qe-commessa").value);
  updateQuoteField(currentQuoteId, "notes", $("#qe-notes").value);
  
  renderQuotesList();
}

function lockQuoteFromUI() {
  if (!currentQuoteId) return;
  lockQuote(currentQuoteId);
  renderQuotesList();
  renderQuoteEditor();
}

function unlockQuoteFromUI() {
  if (!currentQuoteId) return;
  if (unlockQuote(currentQuoteId)) {
    renderQuotesList();
    renderQuoteEditor();
  }
}

function confirmQuoteAsJobFromUI() {
  if (!currentQuoteId) return;
  
  if (!confirm("Confermare il preventivo come Lavoro?\\nIl preventivo verrà bloccato.")) return;

  const job = confirmQuoteAsJob(currentQuoteId);
  if (job) {
    alert(`✅ Preventivo confermato come Lavoro:\\n"${job.titolo}"`);
    persistAndRenderAll();
    renderQuotesList();
    renderQuoteEditor();
  }
}

function printQuoteFromUI() {
  if (!currentQuoteId) return;

  const quote = state.quotes.find(q => q.id === currentQuoteId);
  if (!quote) return;

  const printRoot = $("#print-root");
  if (!printRoot) return;

  // Logo e nome azienda
  let logoHTML = "";
  if (state.companyLogoDataUrl) {
    logoHTML = `<img src="${state.companyLogoDataUrl}" alt="Logo" style="max-width: 120px; max-height: 60px; margin-bottom: 10px;" />`;
  }

  // Dati azienda
  const companyInfo = state.companyInfo || {};
  let companyDetails = "";
  if (companyInfo.address) companyDetails += `<div>${escapeHTML(companyInfo.address)}</div>`;
  if (companyInfo.piva) companyDetails += `<div>P.IVA: ${escapeHTML(companyInfo.piva)}</div>`;
  if (companyInfo.phone) companyDetails += `<div>Tel: ${escapeHTML(companyInfo.phone)}</div>`;
  if (companyInfo.email) companyDetails += `<div>Email: ${escapeHTML(companyInfo.email)}</div>`;

  let righeHTML = "";
  for (const riga of quote.righe) {
    const qty = parseFloat(riga.qty) || 0;
    const unitPrice = parseFloat(riga.unitPrice) || 0;
    const sconto = parseFloat(riga.sconto) || 0;
    const iva = parseFloat(riga.iva) || 0;

    const lineSubtotal = qty * unitPrice * (1 - sconto / 100);
    const lineVat = lineSubtotal * (iva / 100);
    const lineTotal = lineSubtotal + lineVat;

    righeHTML += `
      <tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(riga.desc)}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${qty}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatMoney.format(unitPrice)}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${sconto > 0 ? sconto + "%" : "-"}</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${iva}%</td>
        <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold;">${formatMoney.format(lineTotal)}</td>
      </tr>
    `;
  }

  const html = `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 30px 20px; color: #333;">
      
      <!-- Header 2 colonne: Azienda | Cliente -->
      <div style="display: table; width: 100%; margin-bottom: 30px; border-bottom: 2px solid #007AFF; padding-bottom: 20px;">
        <div style="display: table-row;">
          <!-- Colonna Azienda -->
          <div style="display: table-cell; width: 50%; vertical-align: top; padding-right: 20px;">
            ${logoHTML}
            <h1 style="font-size: 24px; font-weight: 700; margin: 5px 0; color: #007AFF;">${escapeHTML(state.companyName)}</h1>
            <div style="font-size: 12px; color: #666; margin-top: 8px; line-height: 1.6;">
              ${companyDetails}
            </div>
          </div>
          <!-- Colonna Cliente -->
          <div style="display: table-cell; width: 50%; vertical-align: top; text-align: right;">
            <p style="font-size: 28px; font-weight: 800; color: #007AFF; margin: 0;">PREVENTIVO</p>
            <p style="font-size: 16px; font-weight: 600; color: #666; margin: 5px 0;">N. ${quote.number}</p>
            <p style="font-size: 12px; color: #666; margin-top: 15px;">Data: ${fmtShortDate(quote.dateISO)}</p>
            <p style="font-size: 12px; color: #666; margin: 3px 0;">Stato: ${quote.status === "locked" ? "🔒 Confermato" : "✏️ Bozza"}</p>
          </div>
        </div>
      </div>

      <!-- Cliente e commessa -->
      <div style="margin-bottom: 25px; background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #007AFF;">
        <p style="margin: 0; font-size: 13px; color: #666; font-weight: 600;">INTESTATO A:</p>
        <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 700; color: #333;">${escapeHTML(quote.cliente)}</p>
        <p style="margin: 5px 0 0 0; font-size: 14px; color: #666;">Commessa: <strong>${escapeHTML(quote.commessa)}</strong></p>
      </div>

      <!-- Tabella righe -->
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 16px; font-weight: 700; color: #333; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">Dettaglio</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="border: 1px solid #ddd; padding: 10px; text-align: left;">Descrizione</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: center; width: 60px;">Qta</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: right; width: 90px;">Prezzo</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: center; width: 70px;">Sconto</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: center; width: 60px;">IVA</th>
              <th style="border: 1px solid #ddd; padding: 10px; text-align: right; width: 110px;">Totale</th>
            </tr>
          </thead>
          <tbody>
            ${righeHTML}
          </tbody>
        </table>
      </div>

      <!-- Totali -->
      <div style="margin-bottom: 25px;">
        <table style="width: 100%; max-width: 400px; margin-left: auto; font-size: 15px;">
          <tr>
            <td style="padding: 8px 0; font-weight: 600; color: #666;">Imponibile:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 700;">${formatMoney.format(quote.totals.taxable)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: 600; color: #666;">IVA:</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 700;">${formatMoney.format(quote.totals.vat)}</td>
          </tr>
          <tr style="border-top: 2px solid #007AFF;">
            <td style="padding: 12px 0 0 0; font-size: 18px; font-weight: 700; color: #007AFF;">TOTALE:</td>
            <td style="padding: 12px 0 0 0; text-align: right; font-size: 22px; font-weight: 900; color: #007AFF;">${formatMoney.format(quote.totals.total)}</td>
          </tr>
        </table>
      </div>

      <!-- Note -->
      ${quote.notes ? `
        <div style="margin-bottom: 25px; background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px;">
          <h3 style="font-size: 14px; font-weight: 700; color: #92400e; margin: 0 0 8px 0;">Note e Condizioni:</h3>
          <p style="font-size: 13px; line-height: 1.6; color: #78350f; white-space: pre-wrap; margin: 0;">${escapeHTML(quote.notes)}</p>
        </div>
      ` : ""}

      <!-- Footer -->
      <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center;">
        <p style="font-size: 11px; color: #999; margin: 0;">Documento generato da BizManager Pro il ${fmtShortDate(nowISO())}</p>
      </div>

    </div>
  `;

  printRoot.innerHTML = html;
  printRoot.classList.remove("hidden");
  
  setTimeout(() => {
    window.print();
    printRoot.classList.add("hidden");
  }, 300);
}

// PRODUCT HISTORY
function renderProductHistory() {
  const fornitore = safeTrim($("#ph-fornitore").value);
  const anno = $("#ph-anno").value;

  const lines = getProductHistory({ fornitore, annoMin: anno ? anno : null });
  const wrap = $("#ph-results");

  if (!wrap) return;
  wrap.innerHTML = "";

  if (lines.length === 0) {
    wrap.innerHTML = '<p class="text-gray-400 text-sm py-4">Nessun acquisto trovato</p>';
    return;
  }

  const byProd = {};
  for (const line of lines) {
    const key = safeUpper(line.prodotto);
    if (!byProd[key]) byProd[key] = [];
    byProd[key].push(line);
  }

  for (const [prodotto, lines] of Object.entries(byProd)) {
    const stats = getProductStats(prodotto);

    const section = document.createElement("div");
    section.className = "product-section mb-4";
    section.innerHTML = `
      <div class="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-3">
        <h4 class="font-bold text-gray-900">${escapeHTML(prodotto)}</h4>
        <div class="grid grid-cols-2 gap-3 mt-2 text-sm">
          <div><p class="text-xs text-gray-500">Min:</p> <p class="font-bold">${formatMoney.format(stats.minPrice)}</p></div>
          <div><p class="text-xs text-gray-500">Media:</p> <p class="font-bold">${formatMoney.format(stats.avgPrice)}</p></div>
          <div><p class="text-xs text-gray-500">Max:</p> <p class="font-bold">${formatMoney.format(stats.maxPrice)}</p></div>
          <div><p class="text-xs text-gray-500">Ultimo:</p> <p class="font-bold">${formatMoney.format(stats.lastPrice)}</p></div>
          <div class="col-span-2"><p class="text-xs text-gray-500">Acquistati (totale):</p> <p class="font-bold">${stats.qty} pz (${stats.count} ordini)</p></div>
        </div>
      </div>
      <div id="lines-${prodotto}" class="space-y-2"></div>
    `;

    wrap.appendChild(section);

    const linesList = section.querySelector(`#lines-${prodotto}`);
    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "mini-row";
      row.innerHTML = `
        <div class="left">
          <div class="t1">${fmtShortDate(line.dateISO)}</div>
          <div class="t2">${escapeHTML(line.fornitore)} · Qty ${line.qty} @ ${formatMoney.format(line.unitPrice)}</div>
        </div>
        <div class="font-black">${formatMoney.format(line.qty * line.unitPrice)}</div>
      `;
      linesList.appendChild(row);
    }
  }
}

// BACKUP/IMPORT
function downloadBackup() {
  const payload = { exportedAt: nowISO(), app: "BizManagerPro", state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bizmanager_backup_${toISODateOnly()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function importBackupFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      if (!parsed?.state) throw new Error("Formato non valido");

      const ok = confirm("Importare il backup? Sovrascrive i dati correnti.");
      if (!ok) return;

      // Use safe storage wrapper to avoid crashes when localStorage is blocked
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(parsed.state));
      state = loadState();
      persistAndRenderAll();
      alert("Import completato ✅");
    } catch (e) {
      alert("Import fallito: file non valido");
    }
  };
  reader.readAsText(file);
}

function setCompanyName() {
  const current = safeTrim(state.companyName) || "La tua ditta";
  const v = prompt("Nome ditta:", current);
  if (v === null) return;

  const n = safeTrim(v);
  if (!n) return alert("Nome non valido");

  state.companyName = n;
  persistAndRenderAll();
}

function handleLogoButton() {
  if (state.companyLogoDataUrl) {
    const remove = confirm("Logo già presente. Vuoi rimuoverlo?" );
    if (remove) {
      state.companyLogoDataUrl = null;
      saveState();
      alert("Logo rimosso");
      return;
    }
  }
  const input = $("#logo-file-input");
  if (input) input.click();
}

function handleLogoFileChange(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.companyLogoDataUrl = reader.result;
    saveState();
    alert("Logo aggiornato ✅");
  };
  reader.readAsDataURL(file);
}

function upsertAnagrafica(tipo, nome) {
  const n = safeTrim(nome);
  if (!n) return;

  if (tipo === "cliente") {
    state.anagrafiche.clienti = uniq([...state.anagrafiche.clienti, n]).sort(localeSortIT);
  } else if (tipo === "fornitore") {
    state.anagrafiche.fornitori = uniq([...state.anagrafiche.fornitori, n]).sort(localeSortIT);
  }
}

function persistAndRenderAll() {
  state.movimenti = sortMovimentiAsc(state.movimenti).map(m => ({ ...m, commessa: safeUpper(m.commessa) }));
  saveState();

  renderCompany();
  renderKPI();
  if (chart) updateChart();
  renderHomeJobs();
  renderQuotesList($("#quote-search")?.value || "");
  renderQuoteEditor();
  renderStorageWarning();
}

function updateChart() {
  if (!chart) return;
  const movs = sortMovimentiAsc(state.movimenti);
  let saldo = state.saldoIniziale;

  const labels = ["Inizio"];
  const data = [saldo];

  for (const m of movs) {
    saldo = (m.tipo === "entrata") ? saldo + m.importo : saldo - m.importo;
    labels.push(fmtDayMonth(m.dateISO));
    data.push(Math.round(saldo * 100) / 100);
  }

  chart.data.labels = labels;
  chart.data.datasets[0].data = data;
  chart.update();
}

function initChart() {
  const canvas = $("#mainChart");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: ["Inizio"],
      datasets: [{
        label: "Saldo",
        data: [state.saldoIniziale],
        borderColor: "#007AFF",
        backgroundColor: "rgba(0, 122, 255, 0.06)",
        borderWidth: 4,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: "#007AFF",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#AEAEB2", font: { size: 10 } }, grid: { display: false } },
        y: { ticks: { color: "#AEAEB2", font: { size: 10 } }, grid: { color: "#F2F2F7" } }
      }
    }
  });
}

// INIT
function init() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  const btnCompany = $("#btn-company");
  if (btnCompany) btnCompany.addEventListener("click", setCompanyName);

  const btnBackup = $("#btn-backup");
  if (btnBackup) btnBackup.addEventListener("click", downloadBackup);

  const fileImport = $("#file-import");
  if (fileImport) {
    fileImport.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (file) importBackupFromFile(file);
      e.target.value = "";
    });
  }

  const btnResetAll = $("#btn-reset-all");
  if (btnResetAll) btnResetAll.addEventListener("click", resetAllData);

  const btnNewJob = $("#btn-new-job");
  if (btnNewJob) btnNewJob.addEventListener("click", () => setTab("tab-jobs"));

  const btnCreateJob = $("#btn-create-job");
  if (btnCreateJob) btnCreateJob.addEventListener("click", createNewJob);
  // Jobs filter buttons
  const btnJobsOpen = $("#jobs-filter-open");
  const btnJobsArchived = $("#jobs-filter-archived");
  if (btnJobsOpen) btnJobsOpen.addEventListener("click", () => { jobsFilter = "open"; renderJobsTab(); });
  if (btnJobsArchived) btnJobsArchived.addEventListener("click", () => { jobsFilter = "archived"; renderJobsTab(); });

  const btnNewPayment = $("#btn-new-payment");
  if (btnNewPayment) {
    btnNewPayment.addEventListener("click", () => {
      if (state.jobs.filter(j => j.stato === "aperto").length === 0) {
        return alert("Nessun lavoro aperto");
      }
      setTab("tab-payment");
    });
  }

  const btnAddPayment = $("#btn-add-payment");
  if (btnAddPayment) btnAddPayment.addEventListener("click", addJobPaymentFromForm);

  const btnAddPaymentPayment = $("#btn-add-payment-payment");
  if (btnAddPaymentPayment) btnAddPaymentPayment.addEventListener("click", addJobPaymentFromForm);

  const btnAddPaymentDetail = $("#btn-add-payment-detail");
  if (btnAddPaymentDetail) btnAddPaymentDetail.addEventListener("click", addJobPaymentFromForm);

  const paymentJobSelect = $("#payment-job-select");
  if (paymentJobSelect) paymentJobSelect.addEventListener("change", onPaymentJobSelectChange);

  const btnSaveNote = $("#btn-save-note");
  if (btnSaveNote) btnSaveNote.addEventListener("click", saveJobNote);

  const btnAddJobLine = $("#btn-add-job-line");
  if (btnAddJobLine) btnAddJobLine.addEventListener("click", addJobLineFromForm);

  const jlDescInput = document.querySelector("#jl-desc");
  if (jlDescInput) {
    jlDescInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addJobLineFromForm();
      }
    });
  }

  const btnNewQuote = $("#btn-new-quote");
  if (btnNewQuote) btnNewQuote.addEventListener("click", () => {
    setTab("tab-quotes");
    createNewQuoteFromUI();
  });

  const btnCreateNewQuote = $("#btn-create-new-quote");
  if (btnCreateNewQuote) btnCreateNewQuote.addEventListener("click", createNewQuoteFromUI);

  // WIZARD HANDLERS
  const wizClienteInput = $("#wiz-cliente");
  if (wizClienteInput) {
    wizClienteInput.addEventListener("input", (e) => {
      showWizardAutoComplete(e.target.value);
    });
    wizClienteInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        openWizardStep2();
      }
    });
  }

  const btnWizNext1 = $("#btn-wiz-next-1");
  if (btnWizNext1) btnWizNext1.addEventListener("click", openWizardStep2);

  const btnWizCancel1 = $("#btn-wiz-cancel-1");
  if (btnWizCancel1) btnWizCancel1.addEventListener("click", closeWizard);

  const wizCommessaInput = $("#wiz-commessa");
  if (wizCommessaInput) {
    wizCommessaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        createQuoteFromWizard();
      }
    });
  }

  const btnWizBack2 = $("#btn-wiz-back-2");
  if (btnWizBack2) btnWizBack2.addEventListener("click", backWizardStep1);

  const btnWizCancel2 = $("#btn-wiz-cancel-2");
  if (btnWizCancel2) btnWizCancel2.addEventListener("click", closeWizard);

  const btnWizCreate = $("#btn-wiz-create");
  if (btnWizCreate) btnWizCreate.addEventListener("click", createQuoteFromWizard);

  const quoteSearch = $("#quote-search");
  if (quoteSearch) quoteSearch.addEventListener("input", (e) => renderQuotesList(e.target.value));

  const btnAddRiga = $("#btn-qe-add-riga");
  if (btnAddRiga) btnAddRiga.addEventListener("click", addQuoteRigaFromUI);

  const clienteInput = $("#qe-cliente");
  const commessaInput = $("#qe-commessa");
  const notesInput = $("#qe-notes");
  [clienteInput, commessaInput, notesInput].forEach(inp => {
    if (inp) inp.addEventListener("blur", saveQuoteFieldsFromUI);
    if (inp) inp.addEventListener("change", saveQuoteFieldsFromUI);
  });

  const btnLock = $("#btn-qe-lock");
  if (btnLock) btnLock.addEventListener("click", lockQuoteFromUI);

  const btnUnlock = $("#btn-qe-unlock");
  if (btnUnlock) btnUnlock.addEventListener("click", unlockQuoteFromUI);

  const btnPrintQuote = $("#btn-qe-print");
  if (btnPrintQuote) btnPrintQuote.addEventListener("click", printQuoteFromUI);

  const btnResetQuote = $("#btn-qe-reset");
  if (btnResetQuote) btnResetQuote.addEventListener("click", () => {
    if (!currentQuoteId) return;
    resetQuote(currentQuoteId);
  });

  const btnDeleteQuote = $("#btn-qe-delete");
  if (btnDeleteQuote) btnDeleteQuote.addEventListener("click", () => {
    if (!currentQuoteId) return;
    initiateDeleteQuote(currentQuoteId, $("#quote-search")?.value || "");
  });

  const btnDuplicateQuote = $("#btn-qe-duplicate");
  if (btnDuplicateQuote) btnDuplicateQuote.addEventListener("click", () => {
    if (!currentQuoteId) return;
    duplicateQuote(currentQuoteId);
  });

  const btnConfirmJob = $("#btn-qe-confirm-job");
  if (btnConfirmJob) btnConfirmJob.addEventListener("click", confirmQuoteAsJobFromUI);

  const btnSearchProducts = $("#btn-search-products");
  if (btnSearchProducts) btnSearchProducts.addEventListener("click", renderProductHistory);

  const btnLogoUpload = $("#btn-logo-upload");
  if (btnLogoUpload) btnLogoUpload.addEventListener("click", handleLogoButton);

  const logoFile = $("#logo-file-input");
  if (logoFile) logoFile.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    handleLogoFileChange(file);
    e.target.value = "";
  });

  initChart();
  persistAndRenderAll();
  renderStorageWarning();
}

init();
