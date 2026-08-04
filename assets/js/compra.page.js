// =============================================================
// COMPRA PAGE — Capa UI
// -------------------------------------------------------------
// Sin acceso directo a Firestore: usa bingo.service y
// purchase.service exclusivamente.
// =============================================================

import { subscribeToBingo, getAvailableCards } from "../services/bingo.service.js";
import { createPurchase } from "../services/purchase.service.js";
import { formatCurrency, formatDate, formatTime } from "../utils/format.utils.js";
import { showToast } from "../ui/toast.ui.js";

const els = {
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  content: document.getElementById("flow-content"),
  btnVolver: document.getElementById("btn-volver"),
  qtyInput: document.getElementById("qty-input"),
  qtyMinus: document.getElementById("qty-minus"),
  qtyPlus: document.getElementById("qty-plus"),
  qtyError: document.getElementById("qty-error"),
  fullName: document.getElementById("full-name"),
  nameError: document.getElementById("name-error"),
  dni: document.getElementById("dni"),
  dniError: document.getElementById("dni-error"),
  form: document.getElementById("purchase-form"),
  btnContinuar: document.getElementById("btn-continuar"),
  summaryName: document.getElementById("summary-bingo-name"),
  summaryDate: document.getElementById("summary-bingo-date"),
  summaryUnitPrice: document.getElementById("summary-unit-price"),
  summaryQty: document.getElementById("summary-qty"),
  summaryAvailable: document.getElementById("summary-available"),
  summaryTotal: document.getElementById("summary-total")
};

let currentBingo = null;

function getBingoIdFromUrl() {
  return new URLSearchParams(window.location.search).get("bingo");
}

function showState(state) {
  els.loading.hidden = state !== "loading";
  els.empty.hidden = state !== "empty";
  els.content.hidden = state !== "content";
}

function getAvailable() {
  return currentBingo ? getAvailableCards(currentBingo) : 0;
}

function clampQuantity() {
  const available = getAvailable();
  let qty = parseInt(els.qtyInput.value, 10);
  if (Number.isNaN(qty) || qty < 1) qty = 1;
  if (available > 0 && qty > available) qty = available;
  els.qtyInput.value = qty;
  return qty;
}

function renderSummary() {
  if (!currentBingo) return;
  const available = getAvailable();
  const qty = clampQuantity();
  const total = qty * (Number(currentBingo.cardPrice) || 0);

  els.summaryName.textContent = currentBingo.name;
  els.summaryDate.textContent = `${formatDate(currentBingo.eventDate)} · ${formatTime(currentBingo.eventDate)}`;
  els.summaryUnitPrice.textContent = formatCurrency(currentBingo.cardPrice);
  els.summaryQty.textContent = qty;
  els.summaryAvailable.textContent = available;
  els.summaryTotal.textContent = formatCurrency(total);

  els.qtyError.textContent = available === 0 ? "No quedan cartones disponibles." : "";
  els.btnContinuar.disabled = available === 0;
}

function renderBingo(bingo) {
  currentBingo = bingo;
  els.btnVolver.href = `../index.html?bingo=${encodeURIComponent(bingo.id)}`;
  renderSummary();
  showState("content");
}

function validateForm() {
  let valid = true;

  const name = els.fullName.value.trim();
  if (name.length < 3) {
    els.nameError.textContent = "Ingresá tu nombre completo.";
    valid = false;
  } else {
    els.nameError.textContent = "";
  }

  const dni = els.dni.value.trim().replace(/\D/g, "");
  if (dni.length < 6 || dni.length > 10) {
    els.dniError.textContent = "Ingresá un DNI válido.";
    valid = false;
  } else {
    els.dniError.textContent = "";
  }

  if (getAvailable() === 0) {
    valid = false;
  }

  return valid;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!validateForm() || !currentBingo) return;

  const quantity = clampQuantity();
  const fullName = els.fullName.value.trim();
  const dni = els.dni.value.trim().replace(/\D/g, "");

  els.btnContinuar.disabled = true;
  els.btnContinuar.textContent = "Procesando...";

  try {
    const { purchaseId } = await createPurchase({
      bingoId: currentBingo.id,
      fullName,
      dni,
      quantity
    });

    window.location.href = `pago.html?purchase=${encodeURIComponent(purchaseId)}`;
  } catch (err) {
    console.error(err);
    showToast(err.message || "No pudimos procesar tu reserva. Probá de nuevo.", { type: "error" });
    els.btnContinuar.disabled = false;
    els.btnContinuar.textContent = "Continuar al pago →";
  }
}

function init() {
  const bingoId = getBingoIdFromUrl();
  if (!bingoId) {
    showState("empty");
    return;
  }

  showState("loading");

  subscribeToBingo(bingoId, (bingo) => {
    if (!bingo) {
      showState("empty");
      return;
    }
    renderBingo(bingo);
  });

  els.qtyMinus.addEventListener("click", () => {
    els.qtyInput.value = Math.max(1, (parseInt(els.qtyInput.value, 10) || 1) - 1);
    renderSummary();
  });

  els.qtyPlus.addEventListener("click", () => {
    els.qtyInput.value = (parseInt(els.qtyInput.value, 10) || 1) + 1;
    renderSummary();
  });

  els.qtyInput.addEventListener("input", renderSummary);
  els.form.addEventListener("submit", handleSubmit);
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (err) {
    console.error(err);
    showToast("Ocurrió un error al cargar la compra", { type: "error" });
    showState("empty");
  }
});
